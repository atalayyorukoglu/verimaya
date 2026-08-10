import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ReportsService } from './reports.service';

/**
 * AUDIT-01 (Faz 8) — reports.service.ts date boundaries must honor the tenant
 * timezone. Opus denetimi §[MEDIUM]: legacy code used `startOfDayUtc` /
 * `dayAfterUtc` which hard-coded UTC — for a London tenant, a request for
 * 2026-08-01 would include UTC 2026-08-01 00:00–23:59 (which is London
 * 2026-08-01 01:00–2026-08-02 00:59), so a record at UTC 2026-08-01 22:00
 * (London 2026-08-01 23:00) would be in, and a record at UTC 2026-08-01 03:00
 * (London 2026-08-01 04:00) would be in too. After the fix, the day boundaries
 * are computed in the tenant's timezone via `tenantDayRange`.
 */
const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:***@localhost:5433/verimaya';

async function withTenantSession<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
	const { sql } = getDb(databaseUrl);
	await sql`select set_config('app.current_tenant_id', ${tenantId}, false)`;
	try {
		return await fn();
	} finally {
		await sql`select set_config('app.current_tenant_id', '', false)`;
	}
}

describe('AUDIT-01: reports date boundaries honor tenant timezone (Opus §[MEDIUM])', () => {
	const tenantLondon = randomUUID();
	const tenantIstanbul = randomUUID();
	const testUserId = randomUUID();

	// Pick a timestamp that lands on a different day in each timezone.
	// UTC 2026-08-01 23:30 → Istanbul 2026-08-02 02:30 (out of 2026-08-01 bucket)
	//                      → London 2026-08-02 00:30 (out of 2026-08-01 bucket)
	// Both tenants should NOT see this row when filtering for 2026-08-01.
	const rowAtUtcAug1Evening = new Date('2026-08-01T23:30:00Z');

	// A row clearly in the London 2026-08-01 day but past Istanbul midnight:
	// UTC 2026-08-01 22:00 → Istanbul 2026-08-02 01:00 (Istanbul 2026-08-02)
	//                  → London  2026-08-01 23:00 (London 2026-08-01)
	// London should see this, Istanbul should not.
	const rowAtUtcAug1Late = new Date('2026-08-01T22:00:00Z');

	let londonService: ReportsService;
	let istanbulService: ReportsService;
	let patientLondonAug1Late: string;
	let patientLondonAug1Evening: string;
	let patientIstanbulAug1Late: string;
	let patientIstanbulAug1Evening: string;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		// Provision test user (FK target for patients.assigned_user_id if used; for reports
		// we only need patients rows + tenants, but appointments may be created for context).
		await sql`insert into "user" (id, name, email) values (${testUserId}, 'audit-01', ${`audit-01-r-${testUserId}@test.local`})`;

		for (const [tenantId, timezone] of [
			[tenantLondon, 'Europe/London'],
			[tenantIstanbul, 'Europe/Istanbul']
		] as Array<[string, string]>) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, 'AUDIT-01 Reports Test', ${`audit-01-r-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug, timezone)
				values (${tenantId}, 'AUDIT-01 Reports Test', ${`audit-01-r-${tenantId.slice(0, 8)}`}, ${timezone})
			`;

			const tenantContext = new TenantContextService({
				client: db,
				sql
			} as unknown as never);
			const svc = new ReportsService(tenantContext);

			const [p1] = await withTenantSession(tenantId, async () => {
				await sql.begin(async (tx) => {
					await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
					await tx`insert into contact_types (tenant_id, name) values (${tenantId}, 'Hasta') on conflict do nothing`;
				});
				return sql.begin(async (tx) => {
					await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
					return tx`
					insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, status, created_at, updated_at)
					values (
						${tenantId},
						(select id from contact_types where tenant_id = ${tenantId} and name = 'Hasta' limit 1),
						'Hasta',
						${`Late ${tenantId.slice(0, 6)}`},
						${`Late ${tenantId.slice(0, 6)}`},
						'scheduled',
						${rowAtUtcAug1Late.toISOString()},
						${rowAtUtcAug1Late.toISOString()}
					)
					returning id
				`;
				});
			});
			const [p2] = await withTenantSession(tenantId, async () => {
				return sql.begin(async (tx) => {
					await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
					return tx`
					insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, status, created_at, updated_at)
					values (
						${tenantId},
						(select id from contact_types where tenant_id = ${tenantId} and name = 'Hasta' limit 1),
						'Hasta',
						${`Evening ${tenantId.slice(0, 6)}`},
						${`Evening ${tenantId.slice(0, 6)}`},
						'scheduled',
						${rowAtUtcAug1Evening.toISOString()},
						${rowAtUtcAug1Evening.toISOString()}
					)
					returning id
				`;
				});
			});

			if (timezone === 'Europe/London') {
				londonService = svc;
				patientLondonAug1Late = p1!.id;
				patientLondonAug1Evening = p2!.id;
			} else {
				istanbulService = svc;
				patientIstanbulAug1Late = p1!.id;
				patientIstanbulAug1Evening = p2!.id;
			}
		}
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		for (const tenantId of [tenantLondon, tenantIstanbul]) {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
				await tx`delete from contacts where tenant_id = ${tenantId}`;
			});
			await sql`delete from tenants where id = ${tenantId}`;
			await sql`delete from organization where id = ${tenantId}`;
		}
		await sql`delete from "user" where id = ${testUserId}`;
		await closeDb();
	});

	it('London tenant includes row at UTC 2026-08-01 22:00 in 2026-08-01 bucket', async () => {
		// UTC 22:00 → London 23:00 — same day. Should appear.
		const dist = await londonService.contactDistribution(tenantLondon, {
			from: '2026-08-01',
			to: '2026-08-01'
		});
		expect(dist.total).toBeGreaterThanOrEqual(1);
	});

	it('Istanbul tenant does NOT include row at UTC 2026-08-01 22:00 in 2026-08-01 bucket', async () => {
		// UTC 22:00 → Istanbul 01:00 next day. Should NOT appear in Aug 1.
		const dist = await istanbulService.contactDistribution(tenantIstanbul, {
			from: '2026-08-01',
			to: '2026-08-01'
		});
		// Without the fix, this would include the row (UTC hard-coded). With the fix, the
		// Istanbul day bucket is Aug 1 00:00–Aug 2 00:00 local = Jul 31 21:00 UTC – Aug 1 21:00 UTC,
		// so the row at Aug 1 22:00 UTC is excluded.
		expect(dist.total).toBe(0);
	});

	it('two tenants querying 2026-08-01 produce DIFFERENT patient counts (different TZ = different day)', async () => {
		const london = await londonService.contactDistribution(tenantLondon, {
			from: '2026-08-01',
			to: '2026-08-01'
		});
		const istanbul = await istanbulService.contactDistribution(tenantIstanbul, {
			from: '2026-08-01',
			to: '2026-08-01'
		});
		// London includes row at 22:00 (London 23:00), Istanbul excludes it.
		expect(london.total).not.toBe(istanbul.total);
	});
});