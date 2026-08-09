import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { contactsBulkTypeSchema } from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ContactsService } from './contacts.service';

/**
 * GAP-F09-17 (G-17): bulk contact type assignment.
 * Tenant mock mirrors production: drizzle `db.transaction` + SET LOCAL (is_local=true).
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('GAP-F09-17 contacts bulk-type', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactTypeA: string;
	let contactTypeA2: string;
	let contactTypeB: string;
	let contactA1: string;
	let contactA2: string;
	let contactB: string;
	let service: ContactsService;

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

		service = new ContactsService(tenantContext);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Bulk A', ${`bulk-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Bulk B', ${`bulk-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Bulk A', ${`bulk-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Bulk B', ${`bulk-b-${tenantB.slice(0, 8)}`})
		`;

		contactTypeA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name) values (${tenantA}, 'Klinik A') returning id
			`;
			return row!.id as string;
		});
		contactTypeA2 = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name) values (${tenantA}, 'Otel A') returning id
			`;
			return row!.id as string;
		});
		contactTypeB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name) values (${tenantB}, 'Klinik B') returning id
			`;
			return row!.id as string;
		});

		contactA1 = (
			await db.transaction(async (tx) => {
				await tx.execute(
					drizzleSql`select set_config('app.current_tenant_id', ${tenantA}, true)`
				);
				return service.createWithDb(tx as TenantDb, tenantA, {
					contact_type_id: contactTypeA,
					display_name: 'Contact A1'
				});
			})
		).id;

		contactA2 = (
			await db.transaction(async (tx) => {
				await tx.execute(
					drizzleSql`select set_config('app.current_tenant_id', ${tenantA}, true)`
				);
				return service.createWithDb(tx as TenantDb, tenantA, {
					contact_type_id: contactTypeA,
					display_name: 'Contact A2'
				});
			})
		).id;

		contactB = (
			await db.transaction(async (tx) => {
				await tx.execute(
					drizzleSql`select set_config('app.current_tenant_id', ${tenantB}, true)`
				);
				return service.createWithDb(tx as TenantDb, tenantB, {
					contact_type_id: contactTypeB,
					display_name: 'Contact B'
				});
			})
		).id;
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

	it('updates N contacts in one call and returns the real updated count', async () => {
		const result = await service.bulkSetType(tenantA, {
			contact_ids: [contactA1, contactA2],
			contact_type_id: contactTypeA2
		});
		expect(result.updated).toBe(2);

		const a1 = await service.get(tenantA, contactA1);
		const a2 = await service.get(tenantA, contactA2);
		expect(a1.contact_type_id).toBe(contactTypeA2);
		expect(a1.contact_type_name).toBe('Otel A');
		expect(a2.contact_type_id).toBe(contactTypeA2);
	});

	it('skips foreign-tenant contact ids in updated count', async () => {
		const result = await service.bulkSetType(tenantA, {
			contact_ids: [contactA1, contactB, randomUUID()],
			contact_type_id: contactTypeA
		});
		expect(result.updated).toBe(1);

		const stillB = await service.get(tenantB, contactB);
		expect(stillB.contact_type_id).toBe(contactTypeB);
		expect(stillB.display_name).toBe('Contact B');
	});

	it('returns 404 not_found for a contact_type_id outside the tenant', async () => {
		await expect(
			service.bulkSetType(tenantA, {
				contact_ids: [contactA1],
				contact_type_id: contactTypeB
			})
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('rejects empty contact_ids and unknown body fields via strict schema', () => {
		expect(
			contactsBulkTypeSchema.safeParse({
				contact_ids: [],
				contact_type_id: contactTypeA
			}).success
		).toBe(false);
		expect(
			contactsBulkTypeSchema.safeParse({
				contact_ids: [contactA1],
				contact_type_id: contactTypeA,
				extra: true
			}).success
		).toBe(false);
	});
});
