import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { ContactsService } from '../contacts/contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { AppointmentsService } from '../appointments/appointments.service';
import { OperationAlertsService } from '../operation-alerts/operation-alerts.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { RecordSuggestionsService } from './record-suggestions.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';
import { HeuristicLlmClient } from '../integrations/llm/heuristic-llm.client';
import type { LlmClient, LlmRescheduleContext, LlmRescheduleResult } from '../integrations/llm/llm.types';
import { LLM_CLIENT } from '../integrations/llm';
import { SettingsService } from '../settings/settings.service';
import { operationAlertDueAt } from '@verimaya/shared';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(
	tenantId: string,
	fn: (tdb: TenantDb) => Promise<T>
): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(
			drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`
		);
		return fn(tx as TenantDb);
	});
}

function hoursFromNow(hours: number): string {
	return new Date(Date.now() + hours * 3_600_000).toISOString();
}

class EmptyRescheduleLlm implements LlmClient {
	parseTransactionDrafts = vi.fn();
	answerFromKnowledge = vi.fn();
	selectMayaTool = vi.fn();
	async suggestAppointmentReschedule(_ctx: LlmRescheduleContext): Promise<LlmRescheduleResult> {
		return {
			suggestions: [],
			skipped_reason: null,
			usage: {
				provider: 'test',
				model: 'empty',
				requestedModel: null,
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
				estimatedCostUsdMicros: 0,
				path: 'heuristic',
				error: null
			}
		};
	}
}

describe('record-suggestions tenant isolation + Madde 6.2 approval gate (AI-02)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactTypeA: string;
	let contactTypeB: string;
	let patientA: string;
	let patientB: string;
	let appointmentA: string;
	let appointmentB: string;
	let suggestionA: string;
	let recordSuggestionsService: RecordSuggestionsService;
	let appointmentsService: AppointmentsService;
	let operationAlertsService: OperationAlertsService;
	let contactsService: ContactsService;

	const actor = { actorId: 'test-user', actorDisplayName: 'Test User' };

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const dbHandle = getDb(databaseUrl);
		const { sql } = dbHandle;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, (tdb) => fn({ db: tdb }))
		} as TenantContextService;

		operationAlertsService = new OperationAlertsService(tenantContext);
		appointmentsService = new AppointmentsService(tenantContext, operationAlertsService);
		contactsService = new ContactsService(tenantContext, new LocalFileStorage());

		const settings = {
			getKnowledge: async () => ({ sections: {} }),
			getAiPrompt: async () => ({ is_default: true, text: '' })
		} as unknown as SettingsService;

		recordSuggestionsService = new RecordSuggestionsService(
			tenantContext,
			appointmentsService,
			settings,
			new HeuristicLlmClient()
		);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`})
		`;

		contactTypeA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantA}, 'Hasta', 0)
				returning id
			`;
			return row!.id as string;
		});
		contactTypeB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantB}, 'Hasta', 0)
				returning id
			`;
			return row!.id as string;
		});

		patientA = await withTenantSession(tenantA, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Ayse',
				last_name: 'Yilmaz'
			});
			return p.id;
		});
		patientB = await withTenantSession(tenantB, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantB, {
				contact_type_id: contactTypeB,
				first_name: 'Patient B'
			});
			return p.id;
		});

		const startsA = hoursFromNow(120);
		appointmentA = await withTenantSession(tenantA, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				starts_at: startsA,
				ends_at: null,
				title: 'Treatment day',
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
			return a.id;
		});

		appointmentB = await withTenantSession(tenantB, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantB, {
				contact_id: patientB,
				starts_at: hoursFromNow(80),
				ends_at: null,
				title: 'Appointment B',
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
			return a.id;
		});

		const parsed = await recordSuggestionsService.parse(
			tenantA,
			'Ayse Yilmaz randevusunu 2026-09-15 14:00 tarihine alalim'
		);
		suggestionA = parsed.items[0]!.id;
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('tenant B cannot list tenant A suggestions', async () => {
		const page = await recordSuggestionsService.list(tenantB, { limit: 25, status: 'pending' });
		expect(page.items.some((i) => i.id === suggestionA)).toBe(false);
	});

	it('tenant B cannot approve tenant A suggestion', async () => {
		await expect(
			withTenantSession(tenantB, (tdb) =>
				recordSuggestionsService.approveWithDb(tdb, suggestionA, actor)
			)
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('Madde 6.2 — pending suggestion does not change appointments.starts_at until approve', async () => {
		const before = await withTenantSession(tenantA, async (tdb) => {
			const appt = await appointmentsService.updateWithDb(tdb, appointmentA, {});
			return appt.starts_at;
		});

		const pending = await recordSuggestionsService.list(tenantA, { limit: 25, status: 'pending' });
		const row = pending.items.find((i) => i.id === suggestionA);
		expect(row?.status).toBe('pending');
		expect(row?.suggested_value).not.toBe(before);

		const afterList = await withTenantSession(tenantA, async (tdb) => {
			const appt = await appointmentsService.updateWithDb(tdb, appointmentA, {});
			return appt.starts_at;
		});
		expect(afterList).toBe(before);
	});

	it('approve applies starts_at only after explicit approval (Madde 6.2)', async () => {
		const pending = await recordSuggestionsService.list(tenantA, { limit: 25, status: 'pending' });
		const row = pending.items.find((i) => i.id === suggestionA)!;

		const approved = await withTenantSession(tenantA, (tdb) =>
			recordSuggestionsService.approveWithDb(tdb, suggestionA, actor)
		);
		expect(approved.status).toBe('approved');

		const appt = await withTenantSession(tenantA, async (tdb) => {
			return appointmentsService.updateWithDb(tdb, appointmentA, {});
		});
		expect(appt.starts_at).toBe(row.suggested_value);
	});

	it('approve endpoint accepts a single id only (no bulk path)', () => {
		const proto = RecordSuggestionsService.prototype as Record<string, unknown>;
		expect(typeof proto.approveWithDb).toBe('function');
		expect(typeof (proto as { approveAllWithDb?: unknown }).approveAllWithDb).toBe('undefined');
	});

	it('ambiguous LLM output creates no queue rows', async () => {
		const emptyLlmService = new RecordSuggestionsService(
			{ withTenant: (id, fn) => withTenantSession(id, (tdb) => fn({ db: tdb })) } as TenantContextService,
			appointmentsService,
			{ getKnowledge: async () => ({ sections: {} }), getAiPrompt: async () => ({ is_default: true, text: '' }) } as unknown as SettingsService,
			new EmptyRescheduleLlm()
		);
		const result = await emptyLlmService.parse(tenantA, 'belki yarin olur');
		expect(result.items).toEqual([]);
		expect(result.skipped_reason).toBeNull();
	});

	it('stale suggestion returns 409 and does not mutate appointment', async () => {
		const parsed = await recordSuggestionsService.parse(
			tenantA,
			'Ayse Yilmaz randevusunu 2026-10-01 10:00 tarihine ertele'
		);
		const staleId = parsed.items[0]!.id;

		await withTenantSession(tenantA, (tdb) =>
			appointmentsService.updateWithDb(tdb, appointmentA, {
				starts_at: hoursFromNow(200)
			})
		);

		await expect(
			withTenantSession(tenantA, (tdb) =>
				recordSuggestionsService.approveWithDb(tdb, staleId, actor)
			)
		).rejects.toBeInstanceOf(ConflictException);

		await withTenantSession(tenantA, (tdb) =>
			recordSuggestionsService.rejectWithDb(tdb, staleId, actor, { reason: 'stale' })
		);

		const appt = await withTenantSession(tenantA, async (tdb) =>
			appointmentsService.updateWithDb(tdb, appointmentA, {})
		);
		expect(appt.starts_at).not.toBe(parsed.items[0]!.suggested_value);
	});

	it('rejected suggestion cannot be approved afterwards', async () => {
		const parsed = await recordSuggestionsService.parse(
			tenantA,
			'Ayse Yilmaz randevusunu 2026-11-05 09:00 tarihine alalim'
		);
		const rejectId = parsed.items[0]!.id;

		await withTenantSession(tenantA, (tdb) =>
			recordSuggestionsService.rejectWithDb(tdb, rejectId, actor, { reason: 'wrong date' })
		);

		await expect(
			withTenantSession(tenantA, (tdb) =>
				recordSuggestionsService.approveWithDb(tdb, rejectId, actor)
			)
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('after approve, operation alert due_at shifts but confirmed alerts stay confirmed', async () => {
		const parsed = await recordSuggestionsService.parse(
			tenantA,
			'Ayse Yilmaz randevusunu 2026-12-20 14:00 tarihine alalim'
		);
		const id = parsed.items[0]!.id;
		const suggestedIso = parsed.items[0]!.suggested_value;

		const alertsBefore = await operationAlertsService.list(tenantA, { limit: 25 });
		const flightBefore = alertsBefore.items.find(
			(a) => a.appointment_id === appointmentA && a.kind === 'flight'
		)!;
		const welcome = alertsBefore.items.find(
			(a) => a.appointment_id === appointmentA && a.kind === 'welcome'
		)!;
		await withTenantSession(tenantA, (tdb) =>
			operationAlertsService.confirmWithDb(tdb, welcome.id, actor)
		);

		await withTenantSession(tenantA, (tdb) =>
			recordSuggestionsService.approveWithDb(tdb, id, actor)
		);

		const alertsAfter = await operationAlertsService.list(tenantA, { limit: 25 });
		const flightAfter = alertsAfter.items.find(
			(a) => a.appointment_id === appointmentA && a.kind === 'flight'
		)!;
		const welcomeAfter = alertsAfter.items.find(
			(a) => a.appointment_id === appointmentA && a.kind === 'welcome'
		)!;

		const expectedDue = operationAlertDueAt(
			new Date(suggestedIso),
			flightAfter.threshold_hours
		).toISOString();
		expect(flightAfter.due_at).toBe(expectedDue);
		expect(flightAfter.due_at).not.toBe(flightBefore.due_at);
		expect(welcomeAfter.confirmed_at).not.toBeNull();
		expect(welcomeAfter.status).toBe('confirmed');
	});
});

describe('record-suggestions parse skipped_reason (AI-02 feedback)', () => {
	const tenantId = randomUUID();
	let contactTypeId: string;
	let patientId: string;
	let recordSuggestionsService: RecordSuggestionsService;
	let appointmentsService: AppointmentsService;
	let contactsService: ContactsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, (tdb) => fn({ db: tdb }))
		} as TenantContextService;

		const operationAlertsService = new OperationAlertsService(tenantContext);
		appointmentsService = new AppointmentsService(tenantContext, operationAlertsService);
		contactsService = new ContactsService(tenantContext, new LocalFileStorage());

		const settings = {
			getKnowledge: async () => ({ sections: {} }),
			getAiPrompt: async () => ({ is_default: true, text: '' })
		} as unknown as SettingsService;

		recordSuggestionsService = new RecordSuggestionsService(
			tenantContext,
			appointmentsService,
			settings,
			new HeuristicLlmClient()
		);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Skip Reason Tenant', ${`skip-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Skip Reason Tenant', ${`skip-${tenantId.slice(0, 8)}`})
		`;

		contactTypeId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantId}, 'Hasta', 0)
				returning id
			`;
			return row!.id as string;
		});

		patientId = await withTenantSession(tenantId, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantId, {
				contact_type_id: contactTypeId,
				first_name: 'Mehmet',
				last_name: 'Demir'
			});
			return p.id;
		});

		await withTenantSession(tenantId, async (tdb) => {
			await appointmentsService.createWithDb(tdb, tenantId, {
				contact_id: patientId,
				starts_at: '2026-08-20T10:00:00.000Z',
				ends_at: null,
				title: 'Consultation',
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
			await appointmentsService.createWithDb(tdb, tenantId, {
				contact_id: patientId,
				starts_at: '2026-08-25T14:00:00.000Z',
				ends_at: null,
				title: 'Operation',
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
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantId]);
	});

	it('ambiguous_contact when the same patient has 2+ active appointments', async () => {
		const result = await recordSuggestionsService.parse(
			tenantId,
			'Mehmet Demir randevusunu 2026-09-01 11:00 tarihine alalim'
		);
		expect(result.items).toEqual([]);
		expect(result.skipped_reason).toBe('ambiguous_contact');
	});

	it('no_date when message has no parseable date (single appointment patient)', async () => {
		const otherTenant = randomUUID();
		const { sql } = getDb(databaseUrl);
		await sql`
			insert into organization (id, name, slug, created_at)
			values (${otherTenant}, 'No Date Tenant', ${`nodate-${otherTenant.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${otherTenant}, 'No Date Tenant', ${`nodate-${otherTenant.slice(0, 8)}`})
		`;
		const typeId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${otherTenant}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${otherTenant}, 'Hasta', 0)
				returning id
			`;
			return row!.id as string;
		});
		const pid = await withTenantSession(otherTenant, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, otherTenant, {
				contact_type_id: typeId,
				first_name: 'Zeynep',
				last_name: 'Kaya'
			});
			return p.id;
		});
		await withTenantSession(otherTenant, async (tdb) => {
			await appointmentsService.createWithDb(tdb, otherTenant, {
				contact_id: pid,
				starts_at: hoursFromNow(48),
				ends_at: null,
				title: 'Check',
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
		});

		const result = await recordSuggestionsService.parse(
			otherTenant,
			'Zeynep Kaya randevusunu ertele'
		);
		expect(result.items).toEqual([]);
		expect(result.skipped_reason).toBe('no_date');

		await purgeTenantFixtures(sql, [otherTenant]);
	});

	it('no_change when suggested date equals current starts_at', async () => {
		const otherTenant = randomUUID();
		const { sql } = getDb(databaseUrl);
		await sql`
			insert into organization (id, name, slug, created_at)
			values (${otherTenant}, 'No Change Tenant', ${`nochg-${otherTenant.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${otherTenant}, 'No Change Tenant', ${`nochg-${otherTenant.slice(0, 8)}`})
		`;
		const typeId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${otherTenant}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${otherTenant}, 'Hasta', 0)
				returning id
			`;
			return row!.id as string;
		});
		const pid = await withTenantSession(otherTenant, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, otherTenant, {
				contact_type_id: typeId,
				first_name: 'Can',
				last_name: 'Arslan'
			});
			return p.id;
		});
		await withTenantSession(otherTenant, async (tdb) => {
			await appointmentsService.createWithDb(tdb, otherTenant, {
				contact_id: pid,
				starts_at: '2026-10-05T10:00:00.000Z',
				ends_at: null,
				title: 'Op',
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
		});

		const result = await recordSuggestionsService.parse(
			otherTenant,
			'Can Arslan randevusunu 2026-10-05 10:00 tarihine alalim'
		);
		expect(result.items).toEqual([]);
		expect(result.skipped_reason).toBe('no_change');

		await purgeTenantFixtures(sql, [otherTenant]);
	});

	it('returns items and null skipped_reason for a clear single match', async () => {
		const otherTenant = randomUUID();
		const { sql } = getDb(databaseUrl);
		await sql`
			insert into organization (id, name, slug, created_at)
			values (${otherTenant}, 'Ok Parse Tenant', ${`okparse-${otherTenant.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${otherTenant}, 'Ok Parse Tenant', ${`okparse-${otherTenant.slice(0, 8)}`})
		`;
		const typeId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${otherTenant}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${otherTenant}, 'Hasta', 0)
				returning id
			`;
			return row!.id as string;
		});
		const pid = await withTenantSession(otherTenant, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, otherTenant, {
				contact_type_id: typeId,
				first_name: 'Elif',
				last_name: 'Sahin'
			});
			return p.id;
		});
		await withTenantSession(otherTenant, async (tdb) => {
			await appointmentsService.createWithDb(tdb, otherTenant, {
				contact_id: pid,
				starts_at: '2026-11-01T09:00:00.000Z',
				ends_at: null,
				title: 'Op',
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
		});

		const result = await recordSuggestionsService.parse(
			otherTenant,
			'Elif Sahin randevusunu 2026-11-15 14:00 tarihine alalim'
		);
		expect(result.items).toHaveLength(1);
		expect(result.skipped_reason).toBeNull();
		expect(result.items[0]?.suggested_value).toBe('2026-11-15T14:00:00.000Z');

		await purgeTenantFixtures(sql, [otherTenant]);
	});
});

describe('RecordSuggestionsController idempotency surface (AI-02)', () => {
	it('LLM_CLIENT token is injectable for tests', () => {
		expect(LLM_CLIENT).toBeDefined();
	});
});
