import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { AiCorrectionsService } from './ai-corrections.service';

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

const draft = {
	kind: 'income' as const,
	amount: 290000,
	currency: 'GBP' as const,
	title: '2. vizit ödemesi',
	category: null,
	subcategory: null,
	patient_id: null,
	patient_display_name: null,
	contact_label: null,
	occurred_on: '2026-01-15',
	payment_method: null,
	description: null
};

describe('ai_corrections tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let correctionA: string;
	let correctionB: string;
	let service: AiCorrectionsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

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

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>) =>
				withTenantSession(id, () => fn({ tx: sql, db }))
		} as TenantContextService;

		service = new AiCorrectionsService(tenantContext);

		const createdA = await service.create(
			tenantA,
			{ inbound_message_id: null, original_parsed: [draft], corrected: [{ ...draft, amount: 300000 }] },
			'user-a'
		);
		correctionA = createdA.id;

		const createdB = await service.create(
			tenantB,
			{ inbound_message_id: null, original_parsed: [draft], corrected: [{ ...draft, category: 'Vizit' }] },
			'user-b'
		);
		correctionB = createdB.id;
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantA, async () => {
			await sql`delete from ai_corrections where tenant_id = ${tenantA}`;
		});
		await withTenantSession(tenantB, async () => {
			await sql`delete from ai_corrections where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A lists only its own correction', async () => {
		const result = await service.list(tenantA, { limit: 25 });
		expect(result.items.map((c) => c.id)).toEqual([correctionA]);
		expect(result.items.some((c) => c.id === correctionB)).toBe(false);
		expect(result.items[0]?.corrected[0]?.amount).toBe(300000);
	});

	it('Tenant B lists only its own correction', async () => {
		const result = await service.list(tenantB, { limit: 25 });
		expect(result.items.map((c) => c.id)).toEqual([correctionB]);
		expect(result.items.some((c) => c.id === correctionA)).toBe(false);
	});

	it('Tenant A cannot see Tenant B correction via RLS', async () => {
		const { sql } = getDb(databaseUrl);
		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select id from ai_corrections where id = ${correctionB}`;
		});
		expect(rows).toHaveLength(0);
	});
});
