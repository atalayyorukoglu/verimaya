import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('audit_logs RLS isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let logA: string;
	let logB: string;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

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

		logA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into audit_logs (
					tenant_id, actor_display_name, action, entity_type, entity_label
				)
				values (${tenantA}, 'User A', 'update', 'patient', 'Patient A')
				returning id
			`;
			return row!.id as string;
		});

		logB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into audit_logs (
					tenant_id, actor_display_name, action, entity_type, entity_label
				)
				values (${tenantB}, 'User B', 'update', 'contact', 'Contact B')
				returning id
			`;
			return row!.id as string;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantA}`;
		});
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A cannot read Tenant B audit logs under SET LOCAL', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select id from audit_logs order by created_at desc`;
		});

		expect(rows.map((r) => r.id)).toEqual([logA]);
		expect(rows.some((r) => r.id === logB)).toBe(false);
	});

	it('Tenant B cannot read Tenant A audit logs under SET LOCAL', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`select id from audit_logs order by created_at desc`;
		});

		expect(rows.map((r) => r.id)).toEqual([logB]);
		expect(rows.some((r) => r.id === logA)).toBe(false);
	});
});
