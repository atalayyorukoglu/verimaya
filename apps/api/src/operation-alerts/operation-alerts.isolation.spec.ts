import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { ContactsService } from '../contacts/contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { AppointmentsService } from '../appointments/appointments.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { OperationAlertsService } from './operation-alerts.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

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

describe('operation-alerts tenant isolation (AI-04)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactTypeA: string;
	let contactTypeB: string;
	let patientA: string;
	let patientB: string;
	let appointmentA: string;
	let appointmentB: string;
	let alertA: string;
	let operationAlertsService: OperationAlertsService;
	let appointmentsService: AppointmentsService;
	let contactsService: ContactsService;

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
				first_name: 'Patient A'
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

		appointmentA = await withTenantSession(tenantA, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				starts_at: hoursFromNow(100),
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
		appointmentB = await withTenantSession(tenantB, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantB, {
				contact_id: patientB,
				starts_at: hoursFromNow(100),
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

		const pageA = await operationAlertsService.list(tenantA, { limit: 50 });
		const flight = pageA.items.find((item) => item.kind === 'flight');
		if (!flight) throw new Error('expected auto-created flight alert for tenant A');
		alertA = flight.id;
	}, 60_000);

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant B list does not include Tenant A alerts', async () => {
		const page = await operationAlertsService.list(tenantB, { limit: 50 });
		expect(page.items.every((item) => item.tenant_id === tenantB)).toBe(true);
		expect(page.items.some((item) => item.id === alertA)).toBe(false);
		expect(page.items.every((item) => item.appointment_id === appointmentB)).toBe(true);
	});

	it('Tenant B cannot confirm Tenant A alert (404)', async () => {
		await expect(
			withTenantSession(tenantB, (tdb) =>
				operationAlertsService.confirmWithDb(tdb, alertA, {
					actorId: 'user-b',
					actorDisplayName: 'Agent B'
				})
			)
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('Tenant B cannot delete Tenant A alert (404)', async () => {
		await expect(
			withTenantSession(tenantB, (tdb) =>
				operationAlertsService.softDeleteWithDb(tdb, tenantB, alertA, {
					actorId: 'user-b',
					actorDisplayName: 'Agent B'
				})
			)
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('appointment create auto-opens all four kinds; due_at = starts_at − threshold', async () => {
		const page = await operationAlertsService.list(tenantA, { limit: 50 });
		const forAppt = page.items.filter((item) => item.appointment_id === appointmentA);
		const kinds = forAppt.map((item) => item.kind).sort();
		expect(kinds).toEqual(['clinic', 'flight', 'transfer', 'welcome']);
		const flight = forAppt.find((item) => item.kind === 'flight')!;
		const starts = new Date(flight.appointment_starts_at).getTime();
		const due = new Date(flight.due_at).getTime();
		expect(starts - due).toBe(48 * 3_600_000);
		expect(flight.threshold_hours).toBe(48);
	});

	it('within_hours keeps due_at <= now + N (includes overdue)', async () => {
		const within60 = await operationAlertsService.list(tenantA, { limit: 50, within_hours: 60 });
		expect(
			within60.items.filter((i) => i.appointment_id === appointmentA).map((i) => i.kind).sort()
		).toEqual(['flight']);

		const within80 = await operationAlertsService.list(tenantA, { limit: 50, within_hours: 80 });
		expect(
			within80.items.filter((i) => i.appointment_id === appointmentA).map((i) => i.kind).sort()
		).toEqual(['clinic', 'flight', 'transfer']);
	});

	it('hours_left is negative when overdue', async () => {
		const overdueAppointment = await withTenantSession(tenantA, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				starts_at: hoursFromNow(1),
				ends_at: null,
				title: 'Soon',
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
		const page = await operationAlertsService.list(tenantA, { limit: 50, status: 'due' });
		const flight = page.items.find(
			(item) => item.appointment_id === overdueAppointment && item.kind === 'flight'
		);
		expect(flight).toBeDefined();
		expect(flight!.hours_left).toBeLessThan(0);
		expect(flight!.status).toBe('due');
	});

	it('confirm fills confirmed_by with the actor display name', async () => {
		const confirmed = await withTenantSession(tenantA, (tdb) =>
			operationAlertsService.confirmWithDb(tdb, alertA, {
				actorId: 'user-a',
				actorDisplayName: 'Agent A'
			})
		);
		expect(confirmed.confirmed_by).toBe('Agent A');
		expect(confirmed.confirmed_at).toBeTruthy();
		expect(confirmed.status).toBe('confirmed');
	});

	it('appointment date change updates due_at and keeps confirmation', async () => {
		const before = await operationAlertsService.list(tenantA, { limit: 50 });
		const flightBefore = before.items.find((item) => item.id === alertA)!;
		expect(flightBefore.confirmed_at).toBeTruthy();
		const confirmedAt = flightBefore.confirmed_at;
		const confirmedBy = flightBefore.confirmed_by;

		const newStart = hoursFromNow(200);
		await withTenantSession(tenantA, (tdb) =>
			appointmentsService.updateWithDb(tdb, appointmentA, {
				starts_at: newStart
			})
		);

		const after = await operationAlertsService.list(tenantA, { limit: 50 });
		const flightAfter = after.items.find((item) => item.id === alertA)!;
		expect(flightAfter.confirmed_at).toBe(confirmedAt);
		expect(flightAfter.confirmed_by).toBe(confirmedBy);
		expect(flightAfter.due_at).not.toBe(flightBefore.due_at);
		const starts = new Date(flightAfter.appointment_starts_at).getTime();
		const due = new Date(flightAfter.due_at).getTime();
		expect(starts - due).toBe(48 * 3_600_000);
	});

	it('appointment soft-delete hides its alerts', async () => {
		await withTenantSession(tenantA, (tdb) =>
			appointmentsService.softDeleteWithDb(tdb, tenantA, appointmentA, {
				actorId: null,
				actorDisplayName: 'Agent A'
			})
		);
		const page = await operationAlertsService.list(tenantA, { limit: 50 });
		expect(page.items.some((item) => item.appointment_id === appointmentA)).toBe(false);
	});

	it('POST of an existing kind for the same appointment conflicts', async () => {
		await expect(
			withTenantSession(tenantB, (tdb) =>
				operationAlertsService.createWithDb(tdb, tenantB, {
					appointment_id: appointmentB,
					kind: 'flight'
				})
			)
		).rejects.toBeInstanceOf(ConflictException);
	});
});
