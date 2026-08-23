import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { ContactsService } from '../contacts/contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { AppointmentsService } from '../appointments/appointments.service';
import { OperationAlertsService } from '../operation-alerts/operation-alerts.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { IncidentsService } from './incidents.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * Olay kaydı v1 (docs/2026-08-23-maya-icgoru-sorulari.md § 5). Kanıtlanan iddialar:
 *
 *  1. Tenant izolasyonu — liste, oluşturma bağlamı, resolve, delete.
 *  2. `cost_amount`/`cost_currency` CHECK: yalnız biri dolu olamaz.
 *  3. Randevu silinirse (gerçek DB DELETE — appointments FK `ON DELETE SET NULL`)
 *     olay düşmez, yalnız `appointment_id` null olur.
 *  4. Dosya (contact) silinirse (CASCADE) olay da gider — olay dosyaya ait,
 *     bağımsız anlamı yok.
 *  5. `appointment_id` verilip `responsible_contact_id` verilmezse sunucu
 *     randevunun kliniğini otomatik kopyalar.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(tenantId: string, fn: (tdb: TenantDb) => Promise<T>): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
		return fn(tx as TenantDb);
	});
}

describe('incidents tenant isolation + constraints (olay kaydı v1)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();

	let incidentsService: IncidentsService;
	let appointmentsService: AppointmentsService;
	let contactsService: ContactsService;

	let contactTypeA: string;
	let contactTypeB: string;
	let patientA: string;
	let patientB: string;
	let clinicA: string;
	let incidentTypeA: string;
	let incidentTypeB: string;

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
		incidentsService = new IncidentsService(tenantContext);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Incidents A', ${`inc-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Incidents B', ${`inc-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Incidents A', ${`inc-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Incidents B', ${`inc-b-${tenantB.slice(0, 8)}`})
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
		clinicA = await withTenantSession(tenantA, async (tdb) => {
			const c = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Ada Klinik'
			});
			return c.id;
		});

		incidentTypeA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into incident_types (tenant_id, area, name, sort_order)
				values (${tenantA}, 'clinic', 'Revizyon gerekti', 0)
				returning id
			`;
			return row!.id as string;
		});
		incidentTypeB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into incident_types (tenant_id, area, name, sort_order)
				values (${tenantB}, 'clinic', 'Revizyon gerekti', 0)
				returning id
			`;
			return row!.id as string;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('appointment_id verilip responsible_contact_id verilmezse randevunun kliniği otomatik kopyalanır', async () => {
		const appointmentId = await withTenantSession(tenantA, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				starts_at: new Date(Date.now() + 3_600_000).toISOString(),
				ends_at: null,
				title: 'RPT sonrası konsültasyon',
				appointment_type: 'RPT',
				status: 'completed',
				clinic_name: 'Ada Klinik',
				hotel_name: null,
				transfer_note: null,
				clinic_contact_id: clinicA,
				hotel_contact_id: null,
				transfer_contact_id: null,
				notes: null
			});
			return a.id;
		});

		const incident = await withTenantSession(tenantA, (tdb) =>
			incidentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				incident_type_id: incidentTypeA,
				appointment_id: appointmentId,
				occurred_on: '2026-08-20'
			})
		);

		expect(incident.area).toBe('clinic');
		expect(incident.status).toBe('open');
		expect(incident.appointment_id).toBe(appointmentId);
		expect(incident.responsible_contact_id).toBe(clinicA);
		expect(incident.responsible_display_name).toBe('Ada Klinik');

		// (3) Randevu gerçekten silinirse (DB DELETE), olay düşmez — appointment_id null olur.
		await withTenantSession(tenantA, async (tdb) => {
			await tdb.execute(
				drizzleSql`delete from appointments where id = ${appointmentId}`
			);
		});
		const afterDelete = await withTenantSession(tenantA, async (tdb) => {
			const rows = await tdb.execute<{ appointment_id: string | null }>(
				drizzleSql`select appointment_id from incidents where id = ${incident.id}`
			);
			return rows[0];
		});
		expect(afterDelete).toBeDefined();
		expect(afterDelete!.appointment_id).toBeNull();
	});

	it('CHECK cost_amount/cost_currency: yalnız biri dolu olamaz', async () => {
		await expect(
			withTenantSession(tenantA, (tdb) =>
				tdb.execute(
					drizzleSql`insert into incidents (tenant_id, contact_id, incident_type_id, area, status, occurred_on, cost_amount)
						values (${tenantA}, ${patientA}, ${incidentTypeA}, 'clinic', 'open', '2026-08-20', 5000)`
				)
			)
		).rejects.toThrow();

		await expect(
			withTenantSession(tenantA, (tdb) =>
				tdb.execute(
					drizzleSql`insert into incidents (tenant_id, contact_id, incident_type_id, area, status, occurred_on, cost_currency)
						values (${tenantA}, ${patientA}, ${incidentTypeA}, 'clinic', 'open', '2026-08-20', 'TRY')`
				)
			)
		).rejects.toThrow();

		// Both set — allowed.
		const bothSet = await withTenantSession(tenantA, (tdb) =>
			incidentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				incident_type_id: incidentTypeA,
				cost_amount: 15000,
				cost_currency: 'TRY',
				occurred_on: '2026-08-20'
			})
		);
		expect(bothSet.cost_amount).toBe(15000);
		expect(bothSet.cost_currency).toBe('TRY');

		// Both empty — allowed.
		const bothEmpty = await withTenantSession(tenantA, (tdb) =>
			incidentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				incident_type_id: incidentTypeA,
				occurred_on: '2026-08-20'
			})
		);
		expect(bothEmpty.cost_amount).toBeNull();
		expect(bothEmpty.cost_currency).toBeNull();
	});

	it('dosya (contact) silinirse olay da gider (CASCADE) — olay dosyaya ait, bağımsız anlamı yok', async () => {
		const doomedPatient = await withTenantSession(tenantA, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Doomed'
			});
			return p.id;
		});
		const incident = await withTenantSession(tenantA, (tdb) =>
			incidentsService.createWithDb(tdb, tenantA, {
				contact_id: doomedPatient,
				incident_type_id: incidentTypeA,
				occurred_on: '2026-08-20'
			})
		);

		await withTenantSession(tenantA, async (tdb) => {
			await tdb.execute(drizzleSql`delete from contacts where id = ${doomedPatient}`);
		});

		const remaining = await withTenantSession(tenantA, async (tdb) => {
			const rows = await tdb.execute(
				drizzleSql`select id from incidents where id = ${incident.id}`
			);
			return rows;
		});
		expect(remaining.length).toBe(0);
	});

	it('resolve is idempotent and sets resolved_at once', async () => {
		const incident = await withTenantSession(tenantA, (tdb) =>
			incidentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				incident_type_id: incidentTypeA,
				occurred_on: '2026-08-20'
			})
		);
		expect(incident.status).toBe('open');

		const resolved = await withTenantSession(tenantA, (tdb) =>
			incidentsService.resolveWithDb(tdb, incident.id)
		);
		expect(resolved.status).toBe('resolved');
		expect(resolved.resolved_at).toBeTruthy();

		const resolvedAgain = await withTenantSession(tenantA, (tdb) =>
			incidentsService.resolveWithDb(tdb, incident.id)
		);
		expect(resolvedAgain.resolved_at).toBe(resolved.resolved_at);
	});

	it('soft delete hides the incident from list but keeps the row', async () => {
		const incident = await withTenantSession(tenantA, (tdb) =>
			incidentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				incident_type_id: incidentTypeA,
				occurred_on: '2026-08-20'
			})
		);

		await withTenantSession(tenantA, (tdb) =>
			incidentsService.softDeleteWithDb(incident.id, tenantA, tdb)
		);

		const list = await incidentsService.list(tenantA, { contact_id: patientA, limit: 100 });
		expect(list.items.some((i) => i.id === incident.id)).toBe(false);

		const stillInDb = await withTenantSession(tenantA, async (tdb) => {
			const rows = await tdb.execute(
				drizzleSql`select deleted_at from incidents where id = ${incident.id}`
			);
			return rows[0] as { deleted_at: Date | null } | undefined;
		});
		expect(stillInDb?.deleted_at).toBeTruthy();
	});

	it('tenant isolation: Tenant B never sees, resolves, or deletes Tenant A incidents', async () => {
		const incidentA = await withTenantSession(tenantA, (tdb) =>
			incidentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				incident_type_id: incidentTypeA,
				occurred_on: '2026-08-20'
			})
		);

		const listB = await incidentsService.list(tenantB, { limit: 100 });
		expect(listB.items.some((i) => i.id === incidentA.id)).toBe(false);

		await expect(
			withTenantSession(tenantB, (tdb) => incidentsService.resolveWithDb(tdb, incidentA.id))
		).rejects.toBeInstanceOf(NotFoundException);

		await expect(
			withTenantSession(tenantB, (tdb) =>
				incidentsService.softDeleteWithDb(incidentA.id, tenantB, tdb)
			)
		).rejects.toBeInstanceOf(NotFoundException);

		// A Tenant B create referencing a Tenant A contact/type must fail (cross-tenant FK
		// target invisible under RLS ⇒ not_found, never a cross-tenant write).
		await expect(
			withTenantSession(tenantB, (tdb) =>
				incidentsService.createWithDb(tdb, tenantB, {
					contact_id: patientA,
					incident_type_id: incidentTypeB,
					occurred_on: '2026-08-20'
				})
			)
		).rejects.toBeInstanceOf(NotFoundException);

		// Tenant B's own incident, same shape, stays isolated the other way too.
		const incidentB = await withTenantSession(tenantB, (tdb) =>
			incidentsService.createWithDb(tdb, tenantB, {
				contact_id: patientB,
				incident_type_id: incidentTypeB,
				occurred_on: '2026-08-20'
			})
		);
		const listA = await incidentsService.list(tenantA, { limit: 100 });
		expect(listA.items.some((i) => i.id === incidentB.id)).toBe(false);
	});
});
