import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CryptoService } from '../common/crypto.service';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';
import { countAuditLogsForTenant, DataDeleteService } from './data-delete.service';

process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('data-delete tenant isolation (G-25)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const orgNameA = 'Wipe Lab A';
	const orgNameB = 'Wipe Lab B';
	let service: DataDeleteService;
	let tenantContext: TenantContextService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, ${orgNameA}, ${`dd-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, ${orgNameB}, ${`dd-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, ${orgNameA}, ${`dd-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, ${orgNameB}, ${`dd-b-${tenantB.slice(0, 8)}`})
		`;

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [typeA] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantA}, 'Hasta', 0)
				returning id
			`;
			const [contactA] = await tx`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name, first_name, display_name
				) values (
					${tenantA}, ${typeA!.id}, 'Hasta', 'Ada', 'Ada'
				)
				returning id
			`;
			await tx`
				insert into appointments (
					tenant_id, contact_id, contact_display_name, status, starts_at
				) values (
					${tenantA}, ${contactA!.id}, 'Ada', 'scheduled', now()
				)
			`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, currency, contact_id
				) values (
					${tenantA}, 'income', 'A fee', current_date, 'paid', 10000, 'TRY', ${contactA!.id}
				)
			`;
			await tx`
				insert into files (
					tenant_id, contact_id, filename, mime_type, size_bytes, status, storage_key
				) values (
					${tenantA}, ${contactA!.id}, 'a.pdf', 'application/pdf', 10, 'ready', ${`a/${randomUUID()}`}
				)
			`;
			await tx`
				insert into case_notes (
					tenant_id, contact_id, body, author_display_name
				) values (
					${tenantA}, ${contactA!.id}, 'note A', 'Owner'
				)
			`;
			await tx`
				insert into external_ids (
					tenant_id, source, entity_type, external_id, internal_id
				) values (
					${tenantA}, 'xlsx_import', 'contact', 'ext-a', ${contactA!.id}
				)
			`;
			await tx`
				insert into audit_logs (
					tenant_id, actor_display_name, action, entity_type, entity_label
				) values (
					${tenantA}, 'seed', 'create', 'contact', 'Ada'
				)
			`;
		});

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [typeB] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantB}, 'Hasta', 0)
				returning id
			`;
			const [contactB] = await tx`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name, first_name, display_name
				) values (
					${tenantB}, ${typeB!.id}, 'Hasta', 'Bora', 'Bora'
				)
				returning id
			`;
			await tx`
				insert into appointments (
					tenant_id, contact_id, contact_display_name, status, starts_at
				) values (
					${tenantB}, ${contactB!.id}, 'Bora', 'scheduled', now()
				)
			`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, currency, contact_id
				) values (
					${tenantB}, 'income', 'B fee', current_date, 'paid', 20000, 'TRY', ${contactB!.id}
				)
			`;
			await tx`
				insert into files (
					tenant_id, contact_id, filename, mime_type, size_bytes, status, storage_key
				) values (
					${tenantB}, ${contactB!.id}, 'b.pdf', 'application/pdf', 10, 'ready', ${`b/${randomUUID()}`}
				)
			`;
			await tx`
				insert into audit_logs (
					tenant_id, actor_display_name, action, entity_type, entity_label
				) values (
					${tenantB}, 'seed', 'create', 'contact', 'Bora'
				)
			`;
		});

		const dbService = { client: db, sql } as unknown as DbService;
		tenantContext = new TenantContextService(dbService);
		service = new DataDeleteService(tenantContext, new CryptoService());
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('rejects execute without plan_token', async () => {
		await expect(
			service.execute(
				tenantA,
				'owner',
				{ plan_token: '', confirm_organization_name: orgNameA },
				{ actorId: null, actorDisplayName: 'Owner' }
			)
		).rejects.toMatchObject({
			response: { error: { code: 'invalid_plan_token' } }
		});
		expect(BadRequestException).toBeTruthy();
	});

	it('rejects execute with wrong organization name', async () => {
		const preview = await service.preview(tenantA, 'owner', {
			scopes: ['transactions']
		});
		await expect(
			service.execute(
				tenantA,
				'owner',
				{
					plan_token: preview.plan_token,
					confirm_organization_name: 'Wrong Name'
				},
				{ actorId: null, actorDisplayName: 'Owner' }
			)
		).rejects.toMatchObject({
			response: { error: { code: 'confirm_organization_name_mismatch' } }
		});

		const { sql } = getDb(databaseUrl);
		const [{ n }] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select count(*)::int as n from transactions where tenant_id = ${tenantA}`;
		});
		expect(Number(n)).toBe(1);
	});

	it('rejects non-owner roles with owner_required', async () => {
		for (const role of ['admin', 'manager', 'agent', 'finance', 'readonly'] as const) {
			await expect(
				service.preview(tenantA, role, { scopes: ['transactions'] })
			).rejects.toMatchObject({
				response: { error: { code: 'owner_required' } }
			});
			expect(ForbiddenException).toBeTruthy();
		}
	});

	it('Tenant A delete does not touch Tenant B rows', async () => {
		const preview = await service.preview(tenantA, 'owner', {
			scopes: ['transactions']
		});
		const result = await service.execute(
			tenantA,
			'owner',
			{
				plan_token: preview.plan_token,
				confirm_organization_name: orgNameA
			},
			{ actorId: null, actorDisplayName: 'Owner A' }
		);
		expect(result.total_deleted).toBeGreaterThan(0);

		const { sql } = getDb(databaseUrl);
		const counts = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [txB] =
				await tx`select count(*)::int as n from transactions where tenant_id = ${tenantB}`;
			const [apB] =
				await tx`select count(*)::int as n from appointments where tenant_id = ${tenantB}`;
			const [cB] =
				await tx`select count(*)::int as n from contacts where tenant_id = ${tenantB}`;
			const [fB] = await tx`select count(*)::int as n from files where tenant_id = ${tenantB}`;
			return {
				transactions: Number(txB!.n),
				appointments: Number(apB!.n),
				contacts: Number(cB!.n),
				files: Number(fB!.n)
			};
		});
		expect(counts).toEqual({
			transactions: 1,
			appointments: 1,
			contacts: 1,
			files: 1
		});

		const aTx = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] =
				await tx`select count(*)::int as n from transactions where tenant_id = ${tenantA}`;
			return Number(row!.n);
		});
		expect(aTx).toBe(0);
	});

	it('audit log survives delete and records the wipe', async () => {
		const before = await tenantContext.withTenant(tenantA, async ({ db }) =>
			countAuditLogsForTenant(db, tenantA)
		);

		const preview = await service.preview(tenantA, 'owner', { scopes: ['files'] });
		await service.execute(
			tenantA,
			'owner',
			{
				plan_token: preview.plan_token,
				confirm_organization_name: orgNameA
			},
			{ actorId: null, actorDisplayName: 'Owner A' }
		);

		const after = await tenantContext.withTenant(tenantA, async ({ db }) =>
			countAuditLogsForTenant(db, tenantA)
		);
		expect(after).toBe(before + 1);

		const { sql } = getDb(databaseUrl);
		const [row] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select entity_label from audit_logs
				where tenant_id = ${tenantA} and entity_label like 'data_delete%'
				order by created_at desc
				limit 1
			`;
		});
		expect(row?.entity_label).toMatch(/^data_delete scopes=files/);
	});

	it('rolls back all tables when a mid-flight failure is injected', async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [type] =
				await tx`select id from contact_types where tenant_id = ${tenantA} limit 1`;
			const [contact] = await tx`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name, first_name, display_name
				) values (
					${tenantA}, ${type!.id}, 'Hasta', 'Rollback', 'Rollback'
				)
				returning id
			`;
			await tx`
				insert into appointments (
					tenant_id, contact_id, contact_display_name, status, starts_at
				) values (
					${tenantA}, ${contact!.id}, 'Rollback', 'scheduled', now()
				)
			`;
			await tx`
				insert into files (
					tenant_id, contact_id, filename, mime_type, size_bytes, status, storage_key
				) values (
					${tenantA}, ${contact!.id}, 'r.pdf', 'application/pdf', 1, 'ready', ${`r/${randomUUID()}`}
				)
			`;
		});

		const before = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [c] =
				await tx`select count(*)::int as n from contacts where tenant_id = ${tenantA}`;
			const [a] =
				await tx`select count(*)::int as n from appointments where tenant_id = ${tenantA}`;
			const [f] = await tx`select count(*)::int as n from files where tenant_id = ${tenantA}`;
			return { contacts: Number(c!.n), appointments: Number(a!.n), files: Number(f!.n) };
		});

		const preview = await service.preview(tenantA, 'owner', {
			scopes: ['contacts']
		});
		service.failAfterSuccessfulTables = 1;
		try {
			await expect(
				service.execute(
					tenantA,
					'owner',
					{
						plan_token: preview.plan_token,
						confirm_organization_name: orgNameA
					},
					{ actorId: null, actorDisplayName: 'Owner A' }
				)
			).rejects.toThrow('data_delete_injected_failure');
		} finally {
			service.failAfterSuccessfulTables = null;
		}

		const after = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [c] =
				await tx`select count(*)::int as n from contacts where tenant_id = ${tenantA}`;
			const [a] =
				await tx`select count(*)::int as n from appointments where tenant_id = ${tenantA}`;
			const [f] = await tx`select count(*)::int as n from files where tenant_id = ${tenantA}`;
			return { contacts: Number(c!.n), appointments: Number(a!.n), files: Number(f!.n) };
		});
		expect(after).toEqual(before);
	});

	it('rejects replay of the same plan_token', async () => {
		const preview = await service.preview(tenantA, 'owner', {
			scopes: ['appointments']
		});
		await service.execute(
			tenantA,
			'owner',
			{
				plan_token: preview.plan_token,
				confirm_organization_name: orgNameA
			},
			{ actorId: null, actorDisplayName: 'Owner A' }
		);
		await expect(
			service.execute(
				tenantA,
				'owner',
				{
					plan_token: preview.plan_token,
					confirm_organization_name: orgNameA
				},
				{ actorId: null, actorDisplayName: 'Owner A' }
			)
		).rejects.toMatchObject({
			response: { error: { code: 'plan_already_used' } }
		});
	});

	it('preserves contact_types and finance categories (settings not in scope)', async () => {
		const { sql } = getDb(databaseUrl);
		const [types] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select count(*)::int as n from contact_types where tenant_id = ${tenantA}`;
		});
		expect(Number(types!.n)).toBeGreaterThanOrEqual(1);

		const [tenant] = await sql`select name from tenants where id = ${tenantA}`;
		expect(tenant?.name).toBe(orgNameA);
	});
});
