import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import type { CryptoService } from '../common/crypto.service';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { SettingsService } from './settings.service';

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

describe('settings mutations (finance categories + contact types)', () => {
	const tenantId = randomUUID();
	let settingsService: SettingsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Mutations Tenant', ${`mut-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Mutations Tenant', ${`mut-${tenantId.slice(0, 8)}`})
		`;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>) =>
				withTenantSession(id, () => fn({ tx: sql, db }))
		} as TenantContextService;

		settingsService = new SettingsService(tenantContext, {} as CryptoService);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantId, async () => {
			await sql`delete from contacts where tenant_id = ${tenantId}`;
			await sql`delete from finance_categories where tenant_id = ${tenantId}`;
			await sql`delete from contact_types where tenant_id = ${tenantId}`;
			await sql`delete from appointment_types where tenant_id = ${tenantId}`;
		});
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		await closeDb();
	});

	it('creates, updates and deletes a finance category', async () => {
		const created = await settingsService.createFinanceCategory(tenantId, {
			kind: 'expense',
			name: 'Test Kategori',
			subcategories: ['Alt 1']
		});
		expect(created.name).toBe('Test Kategori');
		expect(created.kind).toBe('expense');
		expect(created.subcategories).toEqual(['Alt 1']);

		const updated = await settingsService.updateFinanceCategory(tenantId, created.id, {
			name: 'Güncel Kategori',
			subcategories: ['Alt 1', 'Alt 2']
		});
		expect(updated.name).toBe('Güncel Kategori');
		expect(updated.subcategories).toEqual(['Alt 1', 'Alt 2']);

		await settingsService.deleteFinanceCategory(tenantId, created.id);

		await expect(
			settingsService.updateFinanceCategory(tenantId, created.id, { name: 'x' })
		).rejects.toThrow(NotFoundException);
	});

	it('assigns incrementing sort_order to new finance categories', async () => {
		const first = await settingsService.createFinanceCategory(tenantId, {
			kind: 'income',
			name: 'Gelir 1'
		});
		const second = await settingsService.createFinanceCategory(tenantId, {
			kind: 'income',
			name: 'Gelir 2'
		});

		expect(second.sort_order).toBe(first.sort_order + 1);

		await settingsService.deleteFinanceCategory(tenantId, first.id);
		await settingsService.deleteFinanceCategory(tenantId, second.id);
	});

	it('rejects duplicate contact type names case-insensitively', async () => {
		const created = await settingsService.createContactType(tenantId, { name: 'Klinik' });
		expect(created.name).toBe('Klinik');

		await expect(
			settingsService.createContactType(tenantId, { name: 'klinik' })
		).rejects.toThrow(BadRequestException);

		await settingsService.deleteContactType(tenantId, created.id);
	});

	it('blocks contact type deletion while in use, allows it once freed', async () => {
		const type = await settingsService.createContactType(tenantId, { name: 'Otel' });
		const { sql } = getDb(databaseUrl);

		const contactId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, display_name)
				values (${tenantId}, ${type.id}, ${type.name}, 'Test Otel A.Ş.')
				returning id
			`;
			return row!.id as string;
		});

		await expect(settingsService.deleteContactType(tenantId, type.id)).rejects.toThrow(
			BadRequestException
		);

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`delete from contacts where id = ${contactId}`;
		});

		await expect(settingsService.deleteContactType(tenantId, type.id)).resolves.toBeUndefined();
	});

	it('throws not_found when deleting an unknown contact type', async () => {
		await expect(settingsService.deleteContactType(tenantId, randomUUID())).rejects.toThrow(
			NotFoundException
		);
	});

	it('creates and deletes appointment types; rejects duplicates case-insensitively', async () => {
		const created = await settingsService.createAppointmentType(tenantId, { name: 'Özel Tip' });
		expect(created.name).toBe('Özel Tip');

		await expect(
			settingsService.createAppointmentType(tenantId, { name: 'özel tip' })
		).rejects.toThrow(BadRequestException);

		await settingsService.deleteAppointmentType(tenantId, created.id);
		await expect(settingsService.deleteAppointmentType(tenantId, created.id)).rejects.toThrow(
			NotFoundException
		);
	});
});
