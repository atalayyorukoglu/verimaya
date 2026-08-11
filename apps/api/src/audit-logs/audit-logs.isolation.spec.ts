import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { sql as drizzleSql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLogListQuerySchema } from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import { parseQuery } from '../common/mappers';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AuditLogsService } from './audit-logs.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * GAP-F09-13: audit_logs RLS isolation + list filters.
 * Needs live Postgres (DATABASE_URL_APP).
 *
 * Tenant-scoped writes use sql.begin + SET LOCAL (is_local=true) so the GUC
 * cannot leak across postgres.js pool connections — unlike session-level
 * set_config(..., false) which caused order-dependent flakes.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('audit_logs RLS isolation + filters (GAP-F09-13)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const actorA = randomUUID();
	const actorB = randomUUID();
	let logPatientUpdate: string;
	let logContactCreate: string;
	let logTxnDelete: string;
	let logB: string;
	let auditLogsService: AuditLogsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql, db } = getDb(databaseUrl);

		// Mirror production TenantContextService: drizzle transaction + SET LOCAL.
		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: typeof db }) => Promise<T>) =>
				db.transaction(async (tx) => {
					await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${id}, true)`);
					return fn({ db: tx as typeof db });
				})
		} as TenantContextService;

		auditLogsService = new AuditLogsService(tenantContext);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug, timezone)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}, 'Europe/Istanbul'),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`}, 'Europe/Istanbul')
		`;

		await sql`
			insert into "user" (id, name, email)
			values
				(${actorA}, 'Actor A', ${`actor-a-${actorA}@test.local`}),
				(${actorB}, 'Actor B', ${`actor-b-${actorB}@test.local`})
		`;

		logPatientUpdate = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into audit_logs (
					tenant_id, actor_id, actor_display_name, action, entity_type, entity_label, created_at
				)
				values (
					${tenantA}, ${actorA}, 'User A', 'update', 'contact', 'Patient Alpha',
					timestamptz '2026-08-05 12:00:00+03'
				)
				returning id
			`;
			return row!.id as string;
		});

		logContactCreate = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into audit_logs (
					tenant_id, actor_id, actor_display_name, action, entity_type, entity_label, created_at
				)
				values (
					${tenantA}, ${actorA}, 'User A', 'create', 'contact', 'Clinic Beta',
					timestamptz '2026-08-10 09:00:00+03'
				)
				returning id
			`;
			return row!.id as string;
		});

		logTxnDelete = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into audit_logs (
					tenant_id, actor_id, actor_display_name, action, entity_type, entity_label, created_at
				)
				values (
					${tenantA}, ${actorB}, 'User A2', 'delete', 'transaction', 'Hotel stay',
					timestamptz '2026-08-20 15:00:00+03'
				)
				returning id
			`;
			return row!.id as string;
		});

		logB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into audit_logs (
					tenant_id, actor_id, actor_display_name, action, entity_type, entity_label, created_at
				)
				values (
					${tenantB}, ${actorB}, 'User B', 'update', 'contact', 'Patient Alpha',
					timestamptz '2026-08-10 09:00:00+03'
				)
				returning id
			`;
			return row!.id as string;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await sql`delete from "user" where id in (${actorA}, ${actorB})`;
		await closeDb();
	});

	it('Tenant A cannot read Tenant B audit logs under SET LOCAL', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select id from audit_logs order by created_at desc`;
		});

		const ids = rows.map((r) => r.id);
		expect(ids).toContain(logPatientUpdate);
		expect(ids).toContain(logContactCreate);
		expect(ids).toContain(logTxnDelete);
		expect(ids).not.toContain(logB);
	});

	it('Tenant B cannot read Tenant A audit logs under SET LOCAL', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`select id from audit_logs order by created_at desc`;
		});

		expect(rows.map((r) => r.id)).toEqual([logB]);
		expect(rows.some((r) => r.id === logPatientUpdate)).toBe(false);
	});

	it('filters by action alone', async () => {
		const result = await auditLogsService.list(tenantA, { limit: 25, action: 'delete' });
		expect(result.items.map((r) => r.id)).toEqual([logTxnDelete]);
	});

	it('filters by entity_type alone', async () => {
		const result = await auditLogsService.list(tenantA, { limit: 25, entity_type: 'contact' });
		expect(result.items.map((r) => r.id).sort()).toEqual(
			[logPatientUpdate, logContactCreate].sort()
		);
	});

	it('filters by actor_id alone', async () => {
		const result = await auditLogsService.list(tenantA, { limit: 25, actor_id: actorB });
		expect(result.items.map((r) => r.id)).toEqual([logTxnDelete]);
	});

	it('filters by q on entity_label (case-insensitive contains)', async () => {
		const result = await auditLogsService.list(tenantA, { limit: 25, q: 'alpha' });
		expect(result.items.map((r) => r.id)).toEqual([logPatientUpdate]);
	});

	it('filters by created_from / created_to as tenant calendar days', async () => {
		const fromOnly = await auditLogsService.list(tenantA, {
			limit: 25,
			created_from: '2026-08-10'
		});
		expect(fromOnly.items.map((r) => r.id).sort()).toEqual(
			[logContactCreate, logTxnDelete].sort()
		);

		const toOnly = await auditLogsService.list(tenantA, {
			limit: 25,
			created_to: '2026-08-10'
		});
		expect(toOnly.items.map((r) => r.id).sort()).toEqual(
			[logPatientUpdate, logContactCreate].sort()
		);

		const range = await auditLogsService.list(tenantA, {
			limit: 25,
			created_from: '2026-08-06',
			created_to: '2026-08-15'
		});
		expect(range.items.map((r) => r.id)).toEqual([logContactCreate]);
	});

	it('combines filters and never leaks Tenant B rows', async () => {
		const result = await auditLogsService.list(tenantA, {
			limit: 25,
			action: 'update',
			entity_type: 'contact',
			q: 'Alpha'
		});
		expect(result.items.map((r) => r.id)).toEqual([logPatientUpdate]);
		expect(result.items.some((r) => r.id === logB)).toBe(false);

		const leakProbe = await auditLogsService.list(tenantA, {
			limit: 25,
			actor_id: actorB,
			action: 'update'
		});
		expect(leakProbe.items).toHaveLength(0);
	});

	it('rejects undefined query params with 400 (parseQuery + .strict)', () => {
		const req = { id: 'test-request-id' } as Parameters<typeof parseQuery>[2];
		expect(() =>
			parseQuery(auditLogListQuerySchema, { not_a_real_filter: '1' }, req)
		).toThrow(BadRequestException);
	});

	it('rejects invalid action / entity_type enums with 400', () => {
		const req = { id: 'test-request-id' } as Parameters<typeof parseQuery>[2];
		expect(() => parseQuery(auditLogListQuerySchema, { action: 'hack' }, req)).toThrow(
			BadRequestException
		);
		expect(() =>
			parseQuery(auditLogListQuerySchema, { entity_type: 'invoice' }, req)
		).toThrow(BadRequestException);
	});
});
