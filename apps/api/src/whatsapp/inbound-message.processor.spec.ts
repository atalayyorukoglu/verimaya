import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { HeuristicLlmClient } from '../integrations/llm';
import { PatientsService } from '../patients/patients.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService } from '../tenant/tenant-context.service';
import { IntegrationEventProcessor } from '../queue/integration-event.processor';
import { INBOUND_MESSAGE_PROCESS_JOB_TYPE } from '../queue/queue.constants';
import { DEFAULT_QUEUE_NAME } from '../queue/queue.service';
import { TransactionsService } from '../transactions/transactions.service';
import { InboundMessageProcessor } from './inbound-message.processor';
import { WhatsappService } from './whatsapp.service';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('InboundMessageProcessor (Adım 24a)', () => {
	const tenantId = randomUUID();
	let processor: InboundMessageProcessor;
	let whatsappService: WhatsappService;
	let integrationEventProcessor: IntegrationEventProcessor;
	let tenantContext: TenantContextService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Inbound Worker', ${`iw-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Inbound Worker', ${`iw-${tenantId.slice(0, 8)}`})
		`;

		const dbService = { client: db, sql } as unknown as DbService;
		tenantContext = new TenantContextService(dbService);
		const patientsService = new PatientsService(tenantContext, new LocalFileStorage());
		whatsappService = new WhatsappService(
			patientsService,
			tenantContext,
			new TransactionsService(tenantContext),
			new HeuristicLlmClient()
		);
		processor = new InboundMessageProcessor(tenantContext, whatsappService);
		integrationEventProcessor = new IntegrationEventProcessor(
			tenantContext,
			{ processInboundEvent: async () => ({ kind: 'noop' }) } as never
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`delete from jobs where tenant_id = ${tenantId}`;
			await tx`delete from inbound_messages where tenant_id = ${tenantId}`;
		});
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		await closeDb();
	});

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
});
