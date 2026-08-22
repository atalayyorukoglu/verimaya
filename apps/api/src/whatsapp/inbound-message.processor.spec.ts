import { emptyKnowledgeSections } from '@verimaya/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { HeuristicLlmClient } from '../integrations/llm';
import { ContactsService } from '../contacts/contacts.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { OperationAlertsService } from '../operation-alerts/operation-alerts.service';
import { RecordSuggestionsService } from '../record-suggestions/record-suggestions.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { IntegrationEventProcessor } from '../queue/integration-event.processor';
import { INBOUND_MESSAGE_PROCESS_JOB_TYPE } from '../queue/queue.constants';
import { DEFAULT_QUEUE_NAME } from '../queue/queue.service';
import { TransactionsService } from '../transactions/transactions.service';
import { InboundMessageProcessor } from './inbound-message.processor';
import { WhatsappService } from './whatsapp.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const recordSuggestionsSettingsStub = {
	getAiPrompt: async () => ({
		text: '',
		is_default: true,
		updated_by: null,
		updated_at: null
	}),
	getKnowledge: async () => ({
		sections: emptyKnowledgeSections(),
		is_default: true,
		updated_at: null,
		updated_by: null,
		pii_warnings: []
	})
} as never;

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('InboundMessageProcessor (Adım 24a, AI-08)', () => {
	const tenantId = randomUUID();
	const tenantB = randomUUID();
	let processor: InboundMessageProcessor;
	let whatsappService: WhatsappService;
	let recordSuggestionsService: RecordSuggestionsService;
	let contactsService: ContactsService;
	let appointmentsService: AppointmentsService;
	let integrationEventProcessor: IntegrationEventProcessor;
	let tenantContext: TenantContextService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		for (const [id, name] of [
			[tenantId, 'Inbound Worker'],
			[tenantB, 'Inbound Worker B']
		] as const) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${id}, ${name}, ${`iw-${id.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug)
				values (${id}, ${name}, ${`iw-${id.slice(0, 8)}`})
			`;
		}

		const dbService = { client: db, sql } as unknown as DbService;
		tenantContext = new TenantContextService(dbService);
		contactsService = new ContactsService(tenantContext, new LocalFileStorage());
		whatsappService = new WhatsappService(
			contactsService,
			tenantContext,
			new TransactionsService(tenantContext),
			{
				getAiPrompt: async () => ({
					text: '',
					is_default: true,
					updated_by: null,
					updated_at: null
				}),
				// AI-01: bilgi bankası boş — prompt'a hiçbir şey eklenmemeli.
				getKnowledge: async () => ({
					sections: emptyKnowledgeSections(),
					is_default: true,
					updated_at: null,
					updated_by: null,
					pii_warnings: []
				})
			} as never,
			new HeuristicLlmClient()
		);
		const operationAlertsService = new OperationAlertsService(tenantContext);
		appointmentsService = new AppointmentsService(tenantContext, operationAlertsService);
		recordSuggestionsService = new RecordSuggestionsService(
			tenantContext,
			appointmentsService,
			recordSuggestionsSettingsStub,
			new HeuristicLlmClient()
		);
		processor = new InboundMessageProcessor(tenantContext, whatsappService, recordSuggestionsService);
		integrationEventProcessor = new IntegrationEventProcessor(
			tenantContext,
			{ processInboundEvent: async () => ({ kind: 'noop' }) } as never
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantId, tenantB]);
		await closeDb();
	});

	/** AI-08 testleri için: bir contact + gelecekteki bir randevu oluşturur. */
	async function createContactWithAppointment(
		tid: string,
		displayName: string,
		startsAtIso: string
	): Promise<{ contactId: string; appointmentId: string }> {
		const { sql } = getDb(databaseUrl);
		const [first, ...rest] = displayName.split(' ');
		const contactTypeId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tid}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tid}, 'Hasta', 0)
				on conflict do nothing
				returning id
			`;
			if (row) return row.id as string;
			const [existing] = await tx`
				select id from contact_types where tenant_id = ${tid} and name = 'Hasta' limit 1
			`;
			return existing!.id as string;
		});

		return tenantContext.withTenant(tid, async ({ db }) => {
			const contact = await contactsService.createWithDb(db as TenantDb, tid, {
				contact_type_id: contactTypeId,
				first_name: first!,
				last_name: rest.join(' ') || null
			});
			const appt = await appointmentsService.createWithDb(db as TenantDb, tid, {
				contact_id: contact.id,
				starts_at: startsAtIso,
				ends_at: null,
				title: 'AI-08 test appointment',
				appointment_type: null,
				status: 'scheduled',
				clinic_name: null,
				hotel_name: null,
				transfer_note: null,
				clinic_contact_id: null,
				hotel_contact_id: null,
				transfer_contact_id: null,
				notes: null
			});
			return { contactId: contact.id, appointmentId: appt.id };
		});
	}

	async function insertMessageAndJob(body: string): Promise<{
		messageId: string;
		jobId: string;
	}> {
		const messageId = randomUUID();
		const jobId = randomUUID();
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`
				insert into inbound_messages (id, tenant_id, provider, external_id, payload, status)
				values (
					${messageId}::uuid,
					${tenantId}::uuid,
					'waha',
					${`ext-${messageId.slice(0, 8)}`},
					${JSON.stringify({
						event: 'message',
						payload: { id: `ext-${messageId.slice(0, 8)}`, body }
					})}::jsonb,
					'new'
				)
			`;
			await tx`
				insert into jobs (id, tenant_id, queue, job_type, payload, status)
				values (
					${jobId}::uuid,
					${tenantId}::uuid,
					${DEFAULT_QUEUE_NAME},
					${INBOUND_MESSAGE_PROCESS_JOB_TYPE},
					${JSON.stringify({ inboundMessageId: messageId })}::jsonb,
					'pending'
				)
			`;
		});
		return { messageId, jobId };
	}

	it('success path: parses message and completes job', async () => {
		const { messageId, jobId } = await insertMessageAndJob('Sandra 2900 GBP ödeme alındı');
		await processor.process(jobId, tenantId);

		const { sql } = getDb(databaseUrl);
		const [msg] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`select status, payload from inbound_messages where id = ${messageId}::uuid`;
		});
		expect(msg?.status).toBe('parsed');
		const payload = msg?.payload as { parsed_records?: unknown[] };
		expect(Array.isArray(payload.parsed_records)).toBe(true);
		expect((payload.parsed_records ?? []).length).toBeGreaterThan(0);

		const [job] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`select status from jobs where id = ${jobId}::uuid`;
		});
		expect(job?.status).toBe('completed');
	});

	it('idempotent: second process skips parse (single result)', async () => {
		const { messageId, jobId } = await insertMessageAndJob('Ahmet 100 EUR tahsilat');
		await processor.process(jobId, tenantId);

		const jobId2 = randomUUID();
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`
				insert into jobs (id, tenant_id, queue, job_type, payload, status)
				values (
					${jobId2}::uuid,
					${tenantId}::uuid,
					${DEFAULT_QUEUE_NAME},
					${INBOUND_MESSAGE_PROCESS_JOB_TYPE},
					${JSON.stringify({ inboundMessageId: messageId })}::jsonb,
					'pending'
				)
			`;
		});

		const outcome = await whatsappService.processInboundMessage(tenantId, messageId);
		expect(outcome).toBe('skipped');
		await processor.process(jobId2, tenantId);

		const [msg] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`select status, payload from inbound_messages where id = ${messageId}::uuid`;
		});
		expect(msg?.status).toBe('parsed');
		const payload = msg?.payload as { parsed_records?: unknown[] };
		expect((payload.parsed_records ?? []).length).toBe(1);
	});

	it('permanent failure → markFailed sets jobs.status=failed', async () => {
		const { messageId, jobId } = await insertMessageAndJob('will fail');
		const boom = new Error('permanent parse failure');
		vi.spyOn(whatsappService, 'processInboundMessage').mockRejectedValueOnce(boom);

		await expect(processor.process(jobId, tenantId)).rejects.toThrow(/permanent parse failure/);

		await integrationEventProcessor.markFailed(jobId, tenantId, boom.message, 5);

		const { sql } = getDb(databaseUrl);
		const [job] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`select status, last_error, attempts from jobs where id = ${jobId}::uuid`;
		});
		expect(job?.status).toBe('failed');
		expect(job?.last_error).toContain('permanent parse failure');
		expect(Number(job?.attempts)).toBe(5);

		const [msg] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`select status from inbound_messages where id = ${messageId}::uuid`;
		});
		// Message left new — worker never completed parse
		expect(msg?.status).toBe('new');

		vi.restoreAllMocks();
	});

	it('AI-08: aynı mesajdan hem finans taslağı hem randevu önerisi üretilir', async () => {
		const { appointmentId } = await createContactWithAppointment(
			tenantId,
			'Deniz Korkmaz',
			'2026-09-01T09:00:00.000Z'
		);
		const { messageId, jobId } = await insertMessageAndJob(
			'Deniz Korkmaz randevusunu 2026-09-15 14:00 tarihine alalim, 100 GBP odeme alindi'
		);

		await processor.process(jobId, tenantId);

		const { sql } = getDb(databaseUrl);
		const [msg] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`select status, payload from inbound_messages where id = ${messageId}::uuid`;
		});
		expect(msg?.status).toBe('parsed');
		const payload = msg?.payload as { parsed_records?: unknown[] };
		expect((payload.parsed_records ?? []).length).toBeGreaterThan(0);

		const suggestions = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`
				select id, status from record_update_suggestions
				where appointment_id = ${appointmentId}::uuid and deleted_at is null
			`;
		});
		expect(suggestions.length).toBe(1);
		expect(suggestions[0]?.status).toBe('pending');
	});

	it('AI-08: randevu ajanı patlarsa finans taslağı yine yazılır, job completed olur', async () => {
		const parseSpy = vi
			.spyOn(recordSuggestionsService, 'parse')
			.mockRejectedValueOnce(new Error('boom: randevu ajanı çöktü'));

		const { messageId, jobId } = await insertMessageAndJob('Elif Aydın 250 EUR tahsilat');
		await processor.process(jobId, tenantId);

		const { sql } = getDb(databaseUrl);
		const [msg] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`select status, payload from inbound_messages where id = ${messageId}::uuid`;
		});
		expect(msg?.status).toBe('parsed');
		const payload = msg?.payload as { parsed_records?: unknown[] };
		expect((payload.parsed_records ?? []).length).toBeGreaterThan(0);

		const [job] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`select status from jobs where id = ${jobId}::uuid`;
		});
		expect(job?.status).toBe('completed');

		expect(parseSpy).toHaveBeenCalledTimes(1);
		parseSpy.mockRestore();
	});

	it('AI-08: skipped mesajda randevu ajanı çalışmaz (mükerrer öneri yok)', async () => {
		await createContactWithAppointment(tenantId, 'Kerem Şahin', '2026-10-01T09:00:00.000Z');
		const message = 'Kerem Şahin randevusunu 2026-10-20 11:00 tarihine alalim';
		const { messageId, jobId } = await insertMessageAndJob(message);

		const parseSpy = vi.spyOn(recordSuggestionsService, 'parse');
		await processor.process(jobId, tenantId);
		expect(parseSpy).toHaveBeenCalledTimes(1);

		const jobId2 = randomUUID();
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`
				insert into jobs (id, tenant_id, queue, job_type, payload, status)
				values (
					${jobId2}::uuid,
					${tenantId}::uuid,
					${DEFAULT_QUEUE_NAME},
					${INBOUND_MESSAGE_PROCESS_JOB_TYPE},
					${JSON.stringify({ inboundMessageId: messageId })}::jsonb,
					'pending'
				)
			`;
		});

		await processor.process(jobId2, tenantId);
		// processInboundMessage returns 'skipped' the 2nd time → parse() must not run again.
		expect(parseSpy).toHaveBeenCalledTimes(1);

		parseSpy.mockRestore();
	});

	it('AI-08: gövdesiz (medya-only) mesajda randevu ajanı çalışmaz', async () => {
		const messageId = randomUUID();
		const jobId = randomUUID();
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`
				insert into inbound_messages (id, tenant_id, provider, external_id, payload, status)
				values (
					${messageId}::uuid,
					${tenantId}::uuid,
					'waha',
					${`ext-${messageId.slice(0, 8)}`},
					${JSON.stringify({
						event: 'message',
						payload: { id: `ext-${messageId.slice(0, 8)}`, hasMedia: true }
					})}::jsonb,
					'new'
				)
			`;
			await tx`
				insert into jobs (id, tenant_id, queue, job_type, payload, status)
				values (
					${jobId}::uuid,
					${tenantId}::uuid,
					${DEFAULT_QUEUE_NAME},
					${INBOUND_MESSAGE_PROCESS_JOB_TYPE},
					${JSON.stringify({ inboundMessageId: messageId })}::jsonb,
					'pending'
				)
			`;
		});

		const parseSpy = vi.spyOn(recordSuggestionsService, 'parse');
		await processor.process(jobId, tenantId);
		expect(parseSpy).not.toHaveBeenCalled();

		const [job] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`select status from jobs where id = ${jobId}::uuid`;
		});
		expect(job?.status).toBe('completed');

		parseSpy.mockRestore();
	});

	it('AI-08: tenant A mesajı tenant B için öneri üretmez', async () => {
		await createContactWithAppointment(tenantId, 'Burak Yildiz', '2026-11-01T09:00:00.000Z');
		const { appointmentId: apptB } = await createContactWithAppointment(
			tenantB,
			'Burak Yildiz',
			'2026-11-02T09:00:00.000Z'
		);
		const { jobId } = await insertMessageAndJob(
			'Burak Yildiz randevusunu 2026-11-10 10:00 tarihine alalim'
		);

		await processor.process(jobId, tenantId);

		const { sql } = getDb(databaseUrl);
		const suggestionsB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`
				select id from record_update_suggestions
				where appointment_id = ${apptB}::uuid and deleted_at is null
			`;
		});
		expect(suggestionsB.length).toBe(0);
	});
});
