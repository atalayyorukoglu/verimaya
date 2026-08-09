import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import type { CryptoService } from '../common/crypto.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { SettingsService } from './settings.service';

/**
 * GAP-F09-17 (G-18): contact type rename.
 * Tenant mock mirrors production: drizzle `db.transaction` + SET LOCAL (is_local=true).
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('GAP-F09-17 contact type rename', () => {
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
				(${tenantA}, 'Rename A', ${`rename-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Rename B', ${`rename-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Rename A', ${`rename-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Rename B', ${`rename-b-${tenantB.slice(0, 8)}`})
		`;
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		for (const tenantId of [tenantA, tenantB]) {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
				await tx`delete from contacts where tenant_id = ${tenantId}`;
				await tx`delete from contact_types where tenant_id = ${tenantId}`;
			});
		}
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('renames a contact type (including case-only change) and syncs denormalized names', async () => {
		const { sql } = getDb(databaseUrl);
		const created = await settingsService.createContactType(tenantA, { name: 'klinik' });

		const contactId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, display_name)
				values (${tenantA}, ${created.id}, ${created.name}, 'Linked Klinik')
				returning id
			`;
			return row!.id as string;
		});

		const renamed = await settingsService.updateContactType(tenantA, created.id, {
			name: 'Klinik'
		});
		expect(renamed.name).toBe('Klinik');

		const synced = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				select contact_type_name from contacts where id = ${contactId}
			`;
			return row!.contact_type_name as string;
		});
		expect(synced).toBe('Klinik');
	});

	it('rejects duplicate names case-insensitively with 409 duplicate_type_name', async () => {
		const a = await settingsService.createContactType(tenantA, {
			name: `Alpha-${randomUUID().slice(0, 8)}`
		});
		const b = await settingsService.createContactType(tenantA, {
			name: `Beta-${randomUUID().slice(0, 8)}`
		});

		try {
			await settingsService.updateContactType(tenantA, b.id, { name: a.name.toUpperCase() });
			expect.unreachable('expected ConflictException');
		} catch (err) {
			expect(err).toBeInstanceOf(ConflictException);
			const body = (err as ConflictException).getResponse() as {
				error?: { code?: string };
			};
			expect(body.error?.code).toBe('duplicate_type_name');
		}
	});

	it('allows another tenant to use the same name; Tenant A cannot rename Tenant B type', async () => {
		const name = `Shared-${randomUUID().slice(0, 8)}`;
		const onA = await settingsService.createContactType(tenantA, { name });
		const onB = await settingsService.createContactType(tenantB, { name });
		expect(onA.name).toBe(name);
		expect(onB.name).toBe(name);

		await expect(
			settingsService.updateContactType(tenantA, onB.id, { name: `${name}-hijack` })
		).rejects.toBeInstanceOf(NotFoundException);

		const stillB = await settingsService.updateContactType(tenantB, onB.id, {
			name: `${name}-ok`
		});
		expect(stillB.name).toBe(`${name}-ok`);
	});
});
