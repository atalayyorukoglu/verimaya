import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ReportsService } from './reports.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * GAP-07: appointment-metrics isolation, rate math, soft-delete exclusion,
 * and tenant-timezone day buckets on starts_at.
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

describe('GAP-07: appointment-metrics report', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const tenantLondon = randomUUID();
	const tenantIstanbul = randomUUID();
	const patientA = randomUUID();
	const patientB = randomUUID();
	const patientLondon = randomUUID();
	const patientIstanbul = randomUUID();
	const doctorAlfa = randomUUID();

	let serviceA: ReportsService;
	let serviceB: ReportsService;
	let serviceLondon: ReportsService;
	let serviceIstanbul: ReportsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		const makeService = () =>
			new ReportsService(
				new TenantContextService({
					client: db,
					sql
				} as unknown as never)
			);

		serviceA = makeService();
		serviceB = makeService();
		serviceLondon = makeService();
		serviceIstanbul = makeService();

		for (const [tenantId, name] of [
			[tenantA, 'Gap07 A'],
			[tenantB, 'Gap07 B']
		] as Array<[string, string]>) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, ${name}, ${`gap07-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug, timezone)
				values (${tenantId}, ${name}, ${`gap07-${tenantId.slice(0, 8)}`}, 'Europe/Istanbul')
			`;
		}

		for (const [tenantId, timezone] of [
			[tenantLondon, 'Europe/London'],
			[tenantIstanbul, 'Europe/Istanbul']
		] as Array<[string, string]>) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, 'Gap07 TZ', ${`gap07-tz-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug, timezone)
				values (${tenantId}, 'Gap07 TZ', ${`gap07-tz-${tenantId.slice(0, 8)}`}, ${timezone})
			`;
		}

		await withTenantSession(tenantA, async () => {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
				await tx`insert into contact_types (tenant_id, name) values (${tenantA}, 'Hasta') on conflict do nothing`;
			});
			await sql`insert into contacts (id, tenant_id, contact_type_id, contact_type_name, first_name, display_name, status, created_at, updated_at)
				values (
					${patientA}, ${tenantA},
					(select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1),
					'Hasta', 'Gap07 Patient A', 'Gap07 Patient A', 'scheduled', now(), now())`;
			// Hekim kırılımı için: 2 tamamlanmış "Saç ekimi" Dr. Alfa'ya atanmış, kalan iki
			// randevu hekimsiz (by_doctor 'Atanmamış' bucket'ına düşmeli).
			await sql`insert into contacts (id, tenant_id, contact_type_id, contact_type_name, first_name, display_name, status, created_at, updated_at)
				values (
					${doctorAlfa}, ${tenantA},
					(select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1),
					'Hasta', 'Dr. Alfa', 'Dr. Alfa', 'scheduled', now(), now())`;
			// 4 appointments: 2 completed, 1 no_show, 1 cancelled → rates 0.5 / 0.25 / 0.25
			const seeds: Array<{
				status: string;
				clinic: string | null;
				type: string | null;
				at: string;
				doctor: string | null;
			}> = [
				{
					status: 'completed',
					clinic: 'Klinik Alfa',
					type: 'Saç ekimi',
					at: '2026-03-10T10:00:00Z',
					doctor: doctorAlfa
				},
				{
					status: 'completed',
					clinic: 'Klinik Alfa',
					type: 'Saç ekimi',
					at: '2026-03-11T10:00:00Z',
					doctor: doctorAlfa
				},
				{
					status: 'no_show',
					clinic: null,
					type: null,
					at: '2026-03-12T10:00:00Z',
					doctor: null
				},
				{
					status: 'cancelled',
					clinic: 'Klinik Beta',
					type: 'Kontrol',
					at: '2026-04-01T10:00:00Z',
					doctor: null
				}
			];
			for (const s of seeds) {
				await sql`
					insert into appointments (
						tenant_id, contact_id, contact_display_name, title, appointment_type,
						status, starts_at, clinic_name, doctor_contact_id, created_at, updated_at
					) values (
						${tenantA}, ${patientA}, 'Gap07 Patient A', 'visit', ${s.type},
						${s.status}, ${s.at}, ${s.clinic}, ${s.doctor}, now(), now()
					)
				`;
			}
			// Soft-deleted — must not affect totals/rates
			await sql`
				insert into appointments (
					tenant_id, contact_id, contact_display_name, title, appointment_type,
					status, starts_at, clinic_name, deleted_at, created_at, updated_at
				) values (
					${tenantA}, ${patientA}, 'Gap07 Patient A', 'deleted', 'Saç ekimi',
					'completed', '2026-03-15T10:00:00Z', 'Klinik Alfa', now(), now(), now()
				)
			`;
		});

		await withTenantSession(tenantB, async () => {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
				await tx`insert into contact_types (tenant_id, name) values (${tenantB}, 'Hasta') on conflict do nothing`;
			});
			await sql`
				insert into contacts (id, tenant_id, contact_type_id, contact_type_name, first_name, display_name, status, created_at, updated_at)
				values (
					${patientB}, ${tenantB},
					(select id from contact_types where tenant_id = ${tenantB} and name = 'Hasta' limit 1),
					'Hasta', 'Gap07 Patient B', 'Gap07 Patient B', 'scheduled', now(), now()
				)
			`;
			await sql`
				insert into appointments (
					tenant_id, contact_id, contact_display_name, title, appointment_type,
					status, starts_at, clinic_name, created_at, updated_at
				) values (
					${tenantB}, ${patientB}, 'Gap07 Patient B', 'other-tenant', null,
					'completed', '2026-03-10T10:00:00Z', 'Klinik B', now(), now()
				)
			`;
		});

		// UTC 2026-08-01 22:00 → London 23:00 (Aug 1) / Istanbul 01:00 next day (Aug 2)
		const rowAtUtcAug1Late = '2026-08-01T22:00:00Z';
		await withTenantSession(tenantLondon, async () => {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantLondon}, true)`;
				await tx`insert into contact_types (tenant_id, name) values (${tenantLondon}, 'Hasta') on conflict do nothing`;
			});
			await sql`
				insert into contacts (id, tenant_id, contact_type_id, contact_type_name, first_name, display_name, status, created_at, updated_at)
				values (
					${patientLondon}, ${tenantLondon},
					(select id from contact_types where tenant_id = ${tenantLondon} and name = 'Hasta' limit 1),
					'Hasta', 'London P', 'London P', 'scheduled', now(), now()
				)
			`;
			await sql`
				insert into appointments (
					tenant_id, contact_id, contact_display_name, status, starts_at, created_at, updated_at
				) values (
					${tenantLondon}, ${patientLondon}, 'London P', 'scheduled', ${rowAtUtcAug1Late}, now(), now()
				)
			`;
		});
		await withTenantSession(tenantIstanbul, async () => {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantIstanbul}, true)`;
				await tx`insert into contact_types (tenant_id, name) values (${tenantIstanbul}, 'Hasta') on conflict do nothing`;
			});
			await sql`
				insert into contacts (id, tenant_id, contact_type_id, contact_type_name, first_name, display_name, status, created_at, updated_at)
				values (
					${patientIstanbul}, ${tenantIstanbul},
					(select id from contact_types where tenant_id = ${tenantIstanbul} and name = 'Hasta' limit 1),
					'Hasta', 'Istanbul P', 'Istanbul P', 'scheduled', now(), now()
				)
			`;
			await sql`
				insert into appointments (
					tenant_id, contact_id, contact_display_name, status, starts_at, created_at, updated_at
				) values (
					${tenantIstanbul}, ${patientIstanbul}, 'Istanbul P', 'scheduled', ${rowAtUtcAug1Late}, now(), now()
				)
			`;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB, tenantLondon, tenantIstanbul]);
		await closeDb();
	});

	it('Tenant A rates + clinic/type breakdown; soft-deleted excluded', async () => {
		const metrics = await serviceA.appointmentMetrics(tenantA, {
			from: '2026-03-01',
			to: '2026-04-30'
		});
		expect(metrics.total).toBe(4);
		expect(metrics.completion_rate).toBe(0.5);
		expect(metrics.no_show_rate).toBe(0.25);
		expect(metrics.cancellation_rate).toBe(0.25);

		const alfa = metrics.by_clinic.find((c) => c.clinic_name === 'Klinik Alfa');
		expect(alfa).toMatchObject({ count: 2, completion_rate: 1 });
		const unassigned = metrics.by_clinic.find((c) => c.clinic_name === 'Atanmamış');
		expect(unassigned).toMatchObject({ count: 1, completion_rate: 0, clinic_contact_id: null });

		const sac = metrics.by_appointment_type.find((t) => t.appointment_type === 'Saç ekimi');
		expect(sac).toMatchObject({ count: 2, ratio: 0.5 });
		const unspecified = metrics.by_appointment_type.find(
			(t) => t.appointment_type === 'Belirtilmemiş'
		);
		expect(unspecified).toMatchObject({ count: 1, ratio: 0.25 });

		expect(metrics.monthly.map((m) => m.month)).toEqual(['2026-03', '2026-04']);
	});

	it('hekim alanı: by_doctor + by_doctor_type kırılımı', async () => {
		const metrics = await serviceA.appointmentMetrics(tenantA, {
			from: '2026-03-01',
			to: '2026-04-30'
		});

		const drAlfa = metrics.by_doctor.find((d) => d.doctor_name === 'Dr. Alfa');
		expect(drAlfa).toMatchObject({
			doctor_contact_id: doctorAlfa,
			total: 2,
			completed: 2,
			no_show: 0,
			cancelled: 0
		});
		const unassigned = metrics.by_doctor.find((d) => d.doctor_name === 'Atanmamış');
		expect(unassigned).toMatchObject({
			doctor_contact_id: null,
			total: 2,
			completed: 0,
			no_show: 1,
			cancelled: 1
		});

		// RPT gibi bir dizgi sunucuya gömülmez — ham çapraz sayım döner.
		const drAlfaSac = metrics.by_doctor_type.find(
			(r) => r.doctor_name === 'Dr. Alfa' && r.appointment_type === 'Saç ekimi'
		);
		expect(drAlfaSac).toMatchObject({ doctor_contact_id: doctorAlfa, count: 2 });
		const unassignedKontrol = metrics.by_doctor_type.find(
			(r) => r.doctor_name === 'Atanmamış' && r.appointment_type === 'Kontrol'
		);
		expect(unassignedKontrol).toMatchObject({ doctor_contact_id: null, count: 1 });
	});

	it("Tenant A does not see Tenant B's appointments", async () => {
		const metrics = await serviceA.appointmentMetrics(tenantA, {
			from: '2026-03-01',
			to: '2026-04-30'
		});
		expect(metrics.by_clinic.some((c) => c.clinic_name === 'Klinik B')).toBe(false);
		expect(metrics.total).toBe(4);
	});

	it("Tenant B's by_doctor/by_doctor_type never see Tenant A's Dr. Alfa", async () => {
		const metrics = await serviceB.appointmentMetrics(tenantB, {
			from: '2026-03-01',
			to: '2026-04-30'
		});
		expect(metrics.by_doctor.some((d) => d.doctor_contact_id === doctorAlfa)).toBe(false);
		expect(metrics.by_doctor_type.some((d) => d.doctor_contact_id === doctorAlfa)).toBe(false);
	});

	it('Tenant B lists only its own appointment', async () => {
		const metrics = await serviceB.appointmentMetrics(tenantB, {
			from: '2026-03-01',
			to: '2026-04-30'
		});
		expect(metrics.total).toBe(1);
		expect(metrics.completion_rate).toBe(1);
		expect(metrics.by_clinic.map((c) => c.clinic_name)).toEqual(['Klinik B']);
	});

	it('London includes UTC 2026-08-01 22:00 in 2026-08-01 bucket; Istanbul does not', async () => {
		const london = await serviceLondon.appointmentMetrics(tenantLondon, {
			from: '2026-08-01',
			to: '2026-08-01'
		});
		const istanbul = await serviceIstanbul.appointmentMetrics(tenantIstanbul, {
			from: '2026-08-01',
			to: '2026-08-01'
		});
		expect(london.total).toBe(1);
		expect(istanbul.total).toBe(0);
		expect(london.total).not.toBe(istanbul.total);
	});
});
