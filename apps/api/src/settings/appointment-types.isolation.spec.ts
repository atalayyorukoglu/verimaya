import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { DEFAULT_APPOINTMENT_TYPE_NAMES } from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import type { CryptoService } from '../common/crypto.service';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { defaultAppointmentTypeId } from './appointment-type-defaults';
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

describe('settings appointment-types tenant isolation (GAP-01)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let settingsService: SettingsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Apt Types A', ${`ata-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Apt Types B', ${`atb-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Apt Types A', ${`ata-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Apt Types B', ${`atb-${tenantB.slice(0, 8)}`})
		`;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>) =>
				withTenantSession(id, () => fn({ tx: sql, db }))
		} as TenantContextService;

		settingsService = new SettingsService(tenantContext, {} as CryptoService);

		// Ensure defaults exist (migration seed or lazy seed) before mutating.
		await settingsService.listAppointmentTypes(tenantA);
		await settingsService.listAppointmentTypes(tenantB);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantA, async () => {
			await sql`delete from appointment_types where tenant_id = ${tenantA}`;
		});
		await withTenantSession(tenantB, async () => {
			await sql`delete from appointment_types where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('preserves deterministic default IDs matching defaultAppointmentTypeId', async () => {
		const listed = await settingsService.listAppointmentTypes(tenantA);
		expect(listed.items.map((t) => t.name)).toEqual([...DEFAULT_APPOINTMENT_TYPE_NAMES]);
		for (const name of DEFAULT_APPOINTMENT_TYPE_NAMES) {
			const expectedId = defaultAppointmentTypeId(tenantA, name);
			expect(listed.items.find((t) => t.name === name)?.id).toBe(expectedId);
		}
	});

	it('Tenant B cannot see or delete a type created by Tenant A', async () => {
		const created = await settingsService.createAppointmentType(tenantA, {
			name: 'GAP-01 Isolated Type'
		});

		const listB = await settingsService.listAppointmentTypes(tenantB);
		expect(listB.items.some((t) => t.id === created.id)).toBe(false);
		expect(listB.items.some((t) => t.name === 'GAP-01 Isolated Type')).toBe(false);

		await expect(settingsService.deleteAppointmentType(tenantB, created.id)).rejects.toThrow(
			NotFoundException
		);

		const listA = await settingsService.listAppointmentTypes(tenantA);
		expect(listA.items.some((t) => t.id === created.id)).toBe(true);

		await settingsService.deleteAppointmentType(tenantA, created.id);
		const after = await settingsService.listAppointmentTypes(tenantA);
		expect(after.items.some((t) => t.id === created.id)).toBe(false);
	});

	it('create → list → delete persists for the owning tenant', async () => {
		const created = await settingsService.createAppointmentType(tenantB, { name: 'Pilot Tip' });
		const listed = await settingsService.listAppointmentTypes(tenantB);
		expect(listed.items.some((t) => t.id === created.id && t.name === 'Pilot Tip')).toBe(true);

		await settingsService.deleteAppointmentType(tenantB, created.id);
		const after = await settingsService.listAppointmentTypes(tenantB);
		expect(after.items.some((t) => t.id === created.id)).toBe(false);
	});
});
