import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { PatientsService } from '../patients/patients.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { AppointmentsService } from './appointments.service';

/**
 * TEST-01 (Faz 2.4): appointments tenant isolation. Same template as
 * `webhook-subscriptions.isolation.spec.ts` — services instantiated directly with a faked
 * `TenantContextService` so real Postgres RLS (`SET LOCAL app.current_tenant_id`) is what
 * actually does the blocking, not an app-level `where tenant_id = ...`.
 *
 * Needs a live Postgres (DATABASE_URL_APP) — see 0.3. Not runnable in this sandbox (no
 * docker); written and reasoned through, not executed.
 *
 * Scope note: `AppointmentsController` has no `GET /:id` or `DELETE` route, and
 * `AppointmentsService` has no `get()`/`remove()` — there is nothing to test for
 * get-by-id- or delete-isolation on this resource today (the plan doc's "list/get/update/
 * delete" is aspirational here). What's covered is what actually exists: list, cross-tenant
 * `patient_id` filter leakage, and update.
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

describe('appointments tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let patientA: string;
	let patientB: string;
	let appointmentA: string;
	let appointmentB: string;
	let appointmentsService: AppointmentsService;
	let patientsService: PatientsService;
	let db: TenantDb;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const dbHandle = getDb(databaseUrl);
		db = dbHandle.db;
		const { sql } = dbHandle;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, () => fn({ db }))
		} as TenantContextService;

		appointmentsService = new AppointmentsService(tenantContext);
		patientsService = new PatientsService(tenantContext, new LocalFileStorage());

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

		patientA = await withTenantSession(tenantA, async () => {
			const p = await patientsService.createWithDb(db, tenantA, { full_name: 'Patient A' });
			return p.id;
		});
		patientB = await withTenantSession(tenantB, async () => {
			const p = await patientsService.createWithDb(db, tenantB, { full_name: 'Patient B' });
			return p.id;
		});

		appointmentA = await withTenantSession(tenantA, async () => {
			const a = await appointmentsService.createWithDb(db, tenantA, {
				patient_id: patientA,
				starts_at: new Date().toISOString(),
				ends_at: null,
				title: 'Appointment A',
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
		appointmentB = await withTenantSession(tenantB, async () => {
			const a = await appointmentsService.createWithDb(db, tenantB, {
				patient_id: patientB,
				starts_at: new Date().toISOString(),
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
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantA, async () => {
			await sql`delete from appointments where tenant_id = ${tenantA}`;
			await sql`delete from patients where tenant_id = ${tenantA}`;
		});
		await withTenantSession(tenantB, async () => {
			await sql`delete from appointments where tenant_id = ${tenantB}`;
			await sql`delete from patients where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A lists only its own appointment', async () => {
		const result = await appointmentsService.list(tenantA, { limit: 25 });
		expect(result.items.map((a) => a.id)).toEqual([appointmentA]);
		expect(result.items.some((a) => a.id === appointmentB)).toBe(false);
	});

	it('Tenant B lists only its own appointment', async () => {
		const result = await appointmentsService.list(tenantB, { limit: 25 });
		expect(result.items.map((a) => a.id)).toEqual([appointmentB]);
		expect(result.items.some((a) => a.id === appointmentA)).toBe(false);
	});

	it("Tenant A's patient_id filter using Tenant B's patient does not leak Tenant B's appointment", async () => {
		const result = await appointmentsService.list(tenantA, { limit: 25, patient_id: patientB });
		expect(result.items).toHaveLength(0);
	});

	it('Tenant A cannot update Tenant B appointment', async () => {
		await withTenantSession(tenantA, async () => {
			await expect(
				appointmentsService.updateWithDb(db, appointmentB, { title: 'Hacked by A' })
			).rejects.toBeInstanceOf(NotFoundException);
		});

		const stillB = await appointmentsService.list(tenantB, { limit: 25 });
		expect(stillB.items.find((a) => a.id === appointmentB)?.title).toBe('Appointment B');
	});
});
