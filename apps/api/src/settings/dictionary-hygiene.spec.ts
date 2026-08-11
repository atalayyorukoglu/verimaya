import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import {
	DEFAULT_APPOINTMENT_TYPE_NAMES,
	DEFAULT_CONTACT_TYPE_NAMES,
	DEFAULT_FINANCE_CATEGORY_SEEDS
} from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import type { CryptoService } from '../common/crypto.service';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { defaultAppointmentTypeId } from './appointment-type-defaults';
import { SettingsService } from './settings.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

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

async function insertTenant(tenantId: string, label: string) {
	const { sql } = getDb(databaseUrl);
	const slug = `${label}-${tenantId.slice(0, 8)}`;
	await sql`
		insert into organization (id, name, slug, created_at)
		values (${tenantId}, ${label}, ${slug}, now())
	`;
	await sql`
		insert into tenants (id, name, slug)
		values (${tenantId}, ${label}, ${slug})
	`;
}

async function deleteTenant(tenantId: string) {
	const { sql } = getDb(databaseUrl);
	await purgeTenantFixtures(sql, [tenantId]);
}

function conflictBody(err: unknown): { code?: string; message?: string } {
	expect(err).toBeInstanceOf(ConflictException);
	const body = (err as ConflictException).getResponse() as {
		error?: { code?: string; message?: string };
	};
	return body.error ?? {};
}

describe('GAP-F09-25 dictionary hygiene (unique + seed flags)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const freshTenant = randomUUID();
	let settingsService: SettingsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await insertTenant(tenantA, 'Dict Hyg A');
		await insertTenant(tenantB, 'Dict Hyg B');
		await insertTenant(freshTenant, 'Dict Hyg Fresh');

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>) =>
				withTenantSession(id, () => fn({ tx: sql, db }))
		} as TenantContextService;

		settingsService = new SettingsService(tenantContext, {} as CryptoService);

		await settingsService.listAppointmentTypes(tenantA);
		await settingsService.listAppointmentTypes(tenantB);
		await settingsService.listContactTypes(tenantA);
		await settingsService.listContactTypes(tenantB);
	});

	afterAll(async () => {
		await deleteTenant(tenantA);
		await deleteTenant(tenantB);
		await deleteTenant(freshTenant);
		await closeDb();
	});

	it('appointment type duplicate name → 409 duplicate_type_name; other tenant may reuse name', async () => {
		const name = `GAP-F09-25 Apt ${randomUUID().slice(0, 8)}`;
		await settingsService.createAppointmentType(tenantA, { name });

		try {
			await settingsService.createAppointmentType(tenantA, { name });
			expect.unreachable('expected ConflictException');
		} catch (err) {
			const error = conflictBody(err);
			expect(error.code).toBe('duplicate_type_name');
		}

		try {
			await settingsService.createAppointmentType(tenantA, { name: name.toUpperCase() });
			expect.unreachable('expected ConflictException for case-insensitive duplicate');
		} catch (err) {
			expect(conflictBody(err).code).toBe('duplicate_type_name');
		}

		const onB = await settingsService.createAppointmentType(tenantB, { name });
		expect(onB.name).toBe(name);
	});

	it('contact type duplicate name → 409 duplicate_type_name; other tenant may reuse name', async () => {
		const name = `GAP-F09-25 Contact ${randomUUID().slice(0, 8)}`;
		await settingsService.createContactType(tenantA, { name });

		try {
			await settingsService.createContactType(tenantA, { name });
			expect.unreachable('expected ConflictException');
		} catch (err) {
			expect(conflictBody(err).code).toBe('duplicate_type_name');
		}

		const onB = await settingsService.createContactType(tenantB, { name });
		expect(onB.name).toBe(name);
	});

	it('deleting all appointment types does not re-seed on subsequent GET', async () => {
		const listed = await settingsService.listAppointmentTypes(tenantA);
		expect(listed.items.length).toBeGreaterThan(0);

		for (const item of listed.items) {
			await settingsService.deleteAppointmentType(tenantA, item.id);
		}

		const after = await settingsService.listAppointmentTypes(tenantA);
		expect(after.items).toEqual([]);
	});

	it('deleting all contact types does not re-seed on subsequent GET', async () => {
		const listed = await settingsService.listContactTypes(tenantA);
		expect(listed.items.length).toBeGreaterThan(0);

		for (const item of listed.items) {
			await settingsService.deleteContactType(tenantA, item.id);
		}

		const after = await settingsService.listContactTypes(tenantA);
		expect(after.items).toEqual([]);
	});

	it('deleting all finance categories does not re-seed on subsequent GET', async () => {
		const listed = await settingsService.listFinanceCategories(tenantA);
		expect(listed.items.length).toBeGreaterThan(0);

		for (const item of listed.items) {
			await settingsService.deleteFinanceCategory(tenantA, item.id);
		}

		const after = await settingsService.listFinanceCategories(tenantA);
		expect(after.items).toEqual([]);
	});

	it('new tenant first GET seeds default appointment types with deterministic IDs', async () => {
		const result = await settingsService.listAppointmentTypes(freshTenant);
		expect(result.items).toHaveLength(DEFAULT_APPOINTMENT_TYPE_NAMES.length);
		expect(result.items.map((t) => t.name)).toEqual([...DEFAULT_APPOINTMENT_TYPE_NAMES]);
		for (const item of result.items) {
			expect(item.id).toBe(defaultAppointmentTypeId(freshTenant, item.name));
		}
	});

	it('new tenant first GET seeds default contact types', async () => {
		const result = await settingsService.listContactTypes(freshTenant);
		expect(result.items).toHaveLength(DEFAULT_CONTACT_TYPE_NAMES.length);
		expect(result.items.map((t) => t.name)).toEqual([...DEFAULT_CONTACT_TYPE_NAMES]);
	});

	it('new tenant first GET seeds default finance categories', async () => {
		const result = await settingsService.listFinanceCategories(freshTenant);
		expect(result.items).toHaveLength(DEFAULT_FINANCE_CATEGORY_SEEDS.length);
		expect(result.items.map((c) => `${c.kind}:${c.name}`)).toEqual(
			DEFAULT_FINANCE_CATEGORY_SEEDS.map((s) => `${s.kind}:${s.name}`)
		);
	});
});
