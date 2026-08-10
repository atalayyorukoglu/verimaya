import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import type { CryptoService } from '../common/crypto.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { SettingsService } from './settings.service';

/**
 * §0-A / DOMAIN-02: organizations dictionary CRUD + tenant isolation.
 * Tenant mock mirrors production: drizzle `db.transaction` + SET LOCAL (is_local=true).
 * Session-level set_config(..., false) is forbidden in this spec.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('§0-A organizations dictionary isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let settingsService: SettingsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				db.transaction(async (tx) => {
					await tx.execute(
						drizzleSql`select set_config('app.current_tenant_id', ${id}, true)`
					);
					return fn({ db: tx as TenantDb });
				})
		} as TenantContextService;

		settingsService = new SettingsService(tenantContext, {} as CryptoService);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Org Dict A', ${`org-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Org Dict B', ${`org-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Org Dict A', ${`org-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Org Dict B', ${`org-b-${tenantB.slice(0, 8)}`})
		`;
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		for (const tenantId of [tenantA, tenantB]) {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
				await tx`update contacts set organization_id = null where tenant_id = ${tenantId}`;
				await tx`delete from organizations where tenant_id = ${tenantId}`;
			});
		}
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A cannot list Tenant B organization', async () => {
		const created = await settingsService.createOrganization(tenantB, {
			name: `B-Only-${randomUUID().slice(0, 8)}`
		});

		const listA = await settingsService.listOrganizations(tenantA);
		expect(listA.items.some((o) => o.id === created.id)).toBe(false);

		const listB = await settingsService.listOrganizations(tenantB);
		expect(listB.items.some((o) => o.id === created.id)).toBe(true);
	});

	it('Tenant A cannot rename Tenant B organization', async () => {
		const onB = await settingsService.createOrganization(tenantB, {
			name: `Rename-B-${randomUUID().slice(0, 8)}`
		});

		await expect(
			settingsService.updateOrganization(tenantA, onB.id, { name: `${onB.name}-hijack` })
		).rejects.toBeInstanceOf(NotFoundException);

		const stillB = await settingsService.updateOrganization(tenantB, onB.id, {
			name: `${onB.name}-ok`
		});
		expect(stillB.name).toBe(`${onB.name}-ok`);
	});

	it('Tenant A cannot soft-delete Tenant B organization', async () => {
		const onB = await settingsService.createOrganization(tenantB, {
			name: `Del-B-${randomUUID().slice(0, 8)}`
		});

		await expect(settingsService.deleteOrganization(tenantA, onB.id)).rejects.toBeInstanceOf(
			NotFoundException
		);

		const listB = await settingsService.listOrganizations(tenantB);
		expect(listB.items.some((o) => o.id === onB.id)).toBe(true);

		await settingsService.deleteOrganization(tenantB, onB.id);
		const after = await settingsService.listOrganizations(tenantB);
		expect(after.items.some((o) => o.id === onB.id)).toBe(false);
	});

	it('rejects duplicate names case-insensitively with 409 duplicate_type_name on create', async () => {
		const name = `Dup-Create-${randomUUID().slice(0, 8)}`;
		await settingsService.createOrganization(tenantA, { name });

		try {
			await settingsService.createOrganization(tenantA, { name });
			expect.unreachable('expected ConflictException');
		} catch (err) {
			expect(err).toBeInstanceOf(ConflictException);
			const body = (err as ConflictException).getResponse() as {
				error?: { code?: string };
			};
			expect(body.error?.code).toBe('duplicate_type_name');
		}

		try {
			await settingsService.createOrganization(tenantA, { name: name.toUpperCase() });
			expect.unreachable('expected ConflictException for case-insensitive duplicate');
		} catch (err) {
			expect(err).toBeInstanceOf(ConflictException);
			const body = (err as ConflictException).getResponse() as {
				error?: { code?: string };
			};
			expect(body.error?.code).toBe('duplicate_type_name');
		}

		const onB = await settingsService.createOrganization(tenantB, { name });
		expect(onB.name).toBe(name);
	});

	it('rejects duplicate names case-insensitively with 409 duplicate_type_name on rename', async () => {
		const a = await settingsService.createOrganization(tenantA, {
			name: `Alpha-${randomUUID().slice(0, 8)}`
		});
		const b = await settingsService.createOrganization(tenantA, {
			name: `Beta-${randomUUID().slice(0, 8)}`
		});

		try {
			await settingsService.updateOrganization(tenantA, b.id, { name: a.name.toUpperCase() });
			expect.unreachable('expected ConflictException');
		} catch (err) {
			expect(err).toBeInstanceOf(ConflictException);
			const body = (err as ConflictException).getResponse() as {
				error?: { code?: string };
			};
			expect(body.error?.code).toBe('duplicate_type_name');
		}
	});

	it('soft-deleted name can be reused', async () => {
		const name = `Reuse-${randomUUID().slice(0, 8)}`;
		const first = await settingsService.createOrganization(tenantA, { name });
		await settingsService.deleteOrganization(tenantA, first.id);

		const list = await settingsService.listOrganizations(tenantA);
		expect(list.items.some((o) => o.id === first.id)).toBe(false);

		const second = await settingsService.createOrganization(tenantA, { name });
		expect(second.name).toBe(name);
		expect(second.id).not.toBe(first.id);

		const after = await settingsService.listOrganizations(tenantA);
		expect(after.items.some((o) => o.id === second.id)).toBe(true);
		expect(after.items.some((o) => o.id === first.id)).toBe(false);
	});
});
