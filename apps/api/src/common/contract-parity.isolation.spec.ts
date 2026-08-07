import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compareByCreatedAtDesc, compareByOccurredOnDesc } from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import { AppointmentsService } from '../appointments/appointments.service';
import { ContactsService } from '../contacts/contacts.service';
import { PatientsService } from '../patients/patients.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TransactionsService } from '../transactions/transactions.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

/**
 * CONTRACT-02 (Faz 2.2): DB-side half of the MSW <-> API parity pair. The MSW half
 * (`apps/web/src/lib/mocks/contract-parity.spec.ts`) asserts the mock's filter/order/
 * cursor behavior against the exact same semantics documented in
 * `packages/shared/src/list-query.ts`. This file asserts the *real* API services
 * honor the same semantics against a real tenant-scoped Postgres database.
 *
 * Needs a live Postgres (DATABASE_URL_APP) — see 0.3. Not runnable in this sandbox
 * (no docker); written and reasoned through, not executed. Placed under `src/` (not
 * `apps/api/test/`, despite the plan doc's suggested path) because
 * `apps/api/vitest.config.ts` only globs `src/**\/*.spec.ts` — a `test/` file would
 * silently never run.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
	const { sql } = getDb(databaseUrl);
	await sql`select set_config('app.current_tenant_id', ${tenantId}, false)`;
	try {
		return await fn();
	} finally {
		await sql`select set_config('app.current_tenant_id', '', false)`;
	}
}

describe('CONTRACT-02: API list endpoints match the shared filter + order contract', () => {
	const tenantId = randomUUID();

	let appointmentsService: AppointmentsService;
	let transactionsService: TransactionsService;
	let contactsService: ContactsService;
	let patientsService: PatientsService;

	let patientA: string;
	let patientB: string;
	let contactClinic: string;
	let contactHotel: string;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, () => fn({ db }))
		} as TenantContextService;

		appointmentsService = new AppointmentsService(tenantContext);
		transactionsService = new TransactionsService(tenantContext);
		contactsService = new ContactsService(tenantContext);
		patientsService = new PatientsService(tenantContext, new LocalFileStorage());

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Contract Parity Tenant', ${`contract-parity-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Contract Parity Tenant', ${`contract-parity-${tenantId.slice(0, 8)}`})
		`;

		const contactTypeId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name) values (${tenantId}, 'Klinik') returning id
			`;
			return row!.id as string;
		});
		const otherContactTypeId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name) values (${tenantId}, 'Otel') returning id
			`;
			return row!.id as string;
		});

		await withTenantSession(tenantId, async () => {
			const p1 = await patientsService.createWithDb(db, tenantId, { full_name: 'Parity A' });
			patientA = p1.id;
			const p2 = await patientsService.createWithDb(db, tenantId, { full_name: 'Parity B' });
			patientB = p2.id;

			const clinic = await contactsService.createWithDb(db, tenantId, {
				contact_type_id: contactTypeId,
				display_name: 'Parity Klinik'
			});
			contactClinic = clinic.id;
			const hotel = await contactsService.createWithDb(db, tenantId, {
				contact_type_id: otherContactTypeId,
				display_name: 'Parity Otel'
			});
			contactHotel = hotel.id;

			// Sequential inserts -> strictly increasing created_at, so compareByCreatedAtDesc
			// order is exactly reverse-insertion-order (newest first).
			for (let i = 0; i < 4; i++) {
				await appointmentsService.createWithDb(db, tenantId, {
					patient_id: i % 2 === 0 ? patientA : patientB,
					starts_at: new Date(Date.now() + i * 86_400_000).toISOString(),
					ends_at: null,
					title: `Appt ${i}`,
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
			}

			for (let i = 0; i < 4; i++) {
				await transactionsService.createWithDb(db, tenantId, {
					kind: 'income',
					title: `Tx ${i}`,
					subtitle: null,
					category: null,
					occurred_on: `2026-0${(i % 6) + 1}-15`,
					status: 'paid',
					invoice_status: 'none',
					payment_method: null,
					amount: 1000,
					paid_amount: 1000,
					currency: 'TRY',
					amount_base: 1000,
					base_currency: 'TRY',
					fx_rate: null,
					fx_dated: null,
					patient_id: i % 2 === 0 ? patientA : patientB,
					contact_id: i < 2 ? contactClinic : contactHotel,
					contact_label: null,
					description: null
				});
			}
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantId, async () => {
			await sql`delete from transactions where tenant_id = ${tenantId}`;
			await sql`delete from appointments where tenant_id = ${tenantId}`;
			await sql`delete from patients where tenant_id = ${tenantId}`;
			await sql`delete from contacts where tenant_id = ${tenantId}`;
			await sql`delete from contact_types where tenant_id = ${tenantId}`;
		});
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		await closeDb();
	});

	it('appointments: patient_id filter returns only that patient, newest first', async () => {
		const page = await appointmentsService.list(tenantId, { limit: 25, patient_id: patientA });
		expect(page.items.every((a) => a.patient_id === patientA)).toBe(true);
		expect(page.items).toHaveLength(2);
		expect([...page.items].sort(compareByCreatedAtDesc)).toEqual(page.items);
	});

	it('appointments: cursor pagination covers every row exactly once', async () => {
		const seen = new Set<string>();
		let cursor: string | undefined;
		let guard = 0;
		while (guard++ < 20) {
			const page = await appointmentsService.list(tenantId, { limit: 1, cursor });
			for (const item of page.items) {
				expect(seen.has(item.id)).toBe(false);
				seen.add(item.id);
			}
			if (!page.next_cursor) break;
			cursor = page.next_cursor;
		}
		expect(seen.size).toBe(4);
	});

	it('transactions: contact_id filter returns only that contact', async () => {
		const page = await transactionsService.list(tenantId, { limit: 25, contact_id: contactClinic });
		expect(page.items.every((t) => t.contact_id === contactClinic)).toBe(true);
		expect(page.items).toHaveLength(2);
	});

	it('transactions: list is ordered by occurred_on desc (not created_at)', async () => {
		const page = await transactionsService.list(tenantId, { limit: 25 });
		expect([...page.items].sort(compareByOccurredOnDesc)).toEqual(page.items);
	});

	it('transactions: patient_id filter does not leak the other patient', async () => {
		const page = await transactionsService.list(tenantId, { limit: 25, patient_id: patientB });
		expect(page.items.every((t) => t.patient_id === patientB)).toBe(true);
		expect(page.items.some((t) => t.patient_id === patientA)).toBe(false);
	});

	it('contacts: type_id filter returns only that contact type', async () => {
		const page = await contactsService.list(tenantId, { limit: 25 });
		const clinicOnly = await contactsService.list(tenantId, {
			limit: 25,
			type_id: page.items.find((c) => c.id === contactClinic)!.contact_type_id
		});
		expect(clinicOnly.items.map((c) => c.id)).toContain(contactClinic);
		expect(clinicOnly.items.map((c) => c.id)).not.toContain(contactHotel);
	});

	it('patients: list is ordered newest first (created_at desc, id tiebreak)', async () => {
		const page = await patientsService.list(tenantId, { limit: 25 });
		expect([...page.items].sort(compareByCreatedAtDesc)).toEqual(page.items);
		expect(page.items.map((p) => p.id)).toContain(patientA);
		expect(page.items.map((p) => p.id)).toContain(patientB);
	});
});
