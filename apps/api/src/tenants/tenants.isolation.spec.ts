import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { tenantUpdateSchema } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { closeDb, getDb } from '../db/client';
import { parseBody } from '../common/mappers';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { TenantsService } from './tenants.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * AUDIT-F09-12: tenants GET/PATCH `/v1/tenants/current` isolation.
 * Same template as `contacts.isolation.spec.ts` — service + faked `TenantContextService`,
 * live Postgres (`DATABASE_URL_APP`), session GUC for any RLS-scoped side writes (audit_logs).
 *
 * `tenants` itself has no RLS: the controller always keys off `getActiveOrgId(req)`
 * (ActiveOrgGuard session), never body/query. These cases prove that leak path is closed
 * and that PATCH cannot retarget another org via a forged `id` in the body.
 *
 * Out of scope: `base_currency_locked` (FX-01 / `tenants.spec.ts`) — PATCH cases here never
 * change currency, so they cannot trip 409.
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

type TenantRowSnapshot = {
	id: string;
	name: string;
	slug: string;
	base_currency: string;
	contacts_section_label: string;
	timezone: string;
	created_at: Date | string;
};

async function snapshotTenantRow(tenantId: string): Promise<TenantRowSnapshot> {
	const { sql } = getDb(databaseUrl);
	const [row] = await sql`
		select id, name, slug, base_currency, contacts_section_label, timezone, created_at
		from tenants
		where id = ${tenantId}
	`;
	if (!row) {
		throw new Error(`tenant row missing: ${tenantId}`);
	}
	return row as TenantRowSnapshot;
}

describe('tenants current isolation (AUDIT-F09-12)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const slugA = `iso-a-${tenantA.slice(0, 8)}`;
	const slugB = `iso-b-${tenantB.slice(0, 8)}`;
	let tenantsService: TenantsService;
	const actor = { actorId: null, actorDisplayName: 'Isolation Actor' };

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Clinic Alpha', ${slugA}, now()),
				(${tenantB}, 'Agency Beta', ${slugB}, now())
		`;
		await sql`
			insert into tenants (id, name, slug, base_currency, contacts_section_label, timezone)
			values
				(${tenantA}, 'Clinic Alpha', ${slugA}, 'USD', 'Misafirler', 'Asia/Riyadh'),
				(${tenantB}, 'Agency Beta', ${slugB}, 'EUR', 'Cases', 'Europe/London')
		`;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>) =>
				withTenantSession(id, () => fn({ tx: sql, db }))
		} as TenantContextService;

		tenantsService = new TenantsService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant A GET current returns only A — no B field leakage', async () => {
		const a = await tenantsService.get(tenantA);

		expect(a.id).toBe(tenantA);
		expect(a.name).toBe('Clinic Alpha');
		expect(a.slug).toBe(slugA);
		expect(a.base_currency).toBe('USD');
		expect(a.contacts_section_label).toBe('Misafirler');
		expect(a.timezone).toBe('Asia/Riyadh');

		expect(a.id).not.toBe(tenantB);
		expect(a.name).not.toBe('Agency Beta');
		expect(a.slug).not.toBe(slugB);
		expect(a.base_currency).not.toBe('EUR');
		expect(a.contacts_section_label).not.toBe('Cases');
		expect(a.timezone).not.toBe('Europe/London');
	});

	it('Tenant B GET current returns B — result is active-org scoped, not first-tenant', async () => {
		const b = await tenantsService.get(tenantB);

		expect(b.id).toBe(tenantB);
		expect(b.name).toBe('Agency Beta');
		expect(b.slug).toBe(slugB);
		expect(b.base_currency).toBe('EUR');
		expect(b.contacts_section_label).toBe('Cases');
		expect(b.timezone).toBe('Europe/London');

		expect(b.id).not.toBe(tenantA);
		expect(b.name).not.toBe('Clinic Alpha');
	});

	it('PATCH current mutates only the active tenant — B row is bit-identical', async () => {
		const beforeB = await snapshotTenantRow(tenantB);

		const updated = await tenantsService.update(
			tenantA,
			{
				name: 'Clinic Alpha Updated',
				contacts_section_label: 'Guests',
				timezone: 'UTC'
			},
			actor
		);

		expect(updated.id).toBe(tenantA);
		expect(updated.name).toBe('Clinic Alpha Updated');
		expect(updated.contacts_section_label).toBe('Guests');
		expect(updated.timezone).toBe('UTC');
		// currency untouched — avoids base_currency_locked
		expect(updated.base_currency).toBe('USD');

		const afterA = await tenantsService.get(tenantA);
		expect(afterA.name).toBe('Clinic Alpha Updated');
		expect(afterA.timezone).toBe('UTC');

		const afterB = await snapshotTenantRow(tenantB);
		expect(afterB).toEqual(beforeB);

		const apiB = await tenantsService.get(tenantB);
		expect(apiB.name).toBe('Agency Beta');
		expect(apiB.base_currency).toBe('EUR');
		expect(apiB.contacts_section_label).toBe('Cases');
		expect(apiB.timezone).toBe('Europe/London');
	});

	it('PATCH body with foreign tenant id does not retarget — schema strips id (not .strict())', async () => {
		const req = { id: 'audit-f09-12-foreign-id' } as FastifyRequest;
		const beforeB = await snapshotTenantRow(tenantB);
		const beforeA = await tenantsService.get(tenantA);

		const raw = {
			id: tenantB,
			name: 'Name after forged id'
		};
		const parsed = parseBody(tenantUpdateSchema, raw, req);
		expect(parsed).toEqual({ name: 'Name after forged id' });
		expect('id' in parsed).toBe(false);

		const updated = await tenantsService.update(tenantA, parsed, actor);
		expect(updated.id).toBe(tenantA);
		expect(updated.id).not.toBe(tenantB);
		expect(updated.name).toBe('Name after forged id');
		expect(beforeA.id).toBe(tenantA);

		const afterB = await snapshotTenantRow(tenantB);
		expect(afterB).toEqual(beforeB);
		expect(afterB.name).toBe('Agency Beta');
	});

	it('PATCH body with unknown fields is stripped (schema is not .strict() — not 400)', async () => {
		const req = { id: 'audit-f09-12-unknown-fields' } as FastifyRequest;

		const parsed = parseBody(
			tenantUpdateSchema,
			{
				name: 'Alpha strip-ok',
				tenant_id: tenantB,
				nonsense: true,
				slug: 'stolen-slug'
			},
			req
		);
		expect(parsed).toEqual({ name: 'Alpha strip-ok' });
		expect(parsed).not.toHaveProperty('tenant_id');
		expect(parsed).not.toHaveProperty('nonsense');
		expect(parsed).not.toHaveProperty('slug');

		const beforeB = await snapshotTenantRow(tenantB);
		const updated = await tenantsService.update(tenantA, parsed, actor);
		expect(updated.id).toBe(tenantA);
		expect(updated.name).toBe('Alpha strip-ok');
		expect(updated.slug).toBe(slugA);

		const afterB = await snapshotTenantRow(tenantB);
		expect(afterB).toEqual(beforeB);
	});

	it('documents: unknown-only body still parses (empty patch), does not 400', async () => {
		const req = { id: 'audit-f09-12-unknown-only' } as FastifyRequest;
		const parsed = parseBody(tenantUpdateSchema, { id: tenantB, extra: 1 }, req);
		expect(parsed).toEqual({});

		// Contrasting control: invalid *known* field still 400s
		expect(() =>
			parseBody(tenantUpdateSchema, { timezone: 'Not/A_Real_Zone' }, req)
		).toThrow(BadRequestException);
	});
});
