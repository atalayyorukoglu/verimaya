/**
 * GAP-F09-16: WhatsApp inline create — contact / patient / category.
 * Tenant mock mirrors production: drizzle `db.transaction` + SET LOCAL (is_local=true).
 * Subcategory create is intentionally out of scope (flat finance_categories model).
 */
import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
	whatsappCreateCategorySchema,
	whatsappCreateContactSchema,
	whatsappCreatePatientSchema
} from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import type { CryptoService } from '../common/crypto.service';
import { parseBody } from '../common/mappers';
import { LocalFileStorage } from '../storage/local-file.storage';
import { ContactsService } from '../contacts/contacts.service';
import { PatientsService } from '../patients/patients.service';
import { SettingsService } from '../settings/settings.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import type { FastifyRequest } from 'fastify';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

function fakeReq(): FastifyRequest {
	return { id: 'gap-f09-16-test' } as FastifyRequest;
}

function conflictCode(err: unknown): string | undefined {
	const body = (err as ConflictException).getResponse() as {
		error?: { code?: string };
	};
	return body.error?.code;
}

describe('GAP-F09-16 whatsapp inline create', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactTypeA: string;
	let contactTypeB: string;
	let contactsService: ContactsService;
	let patientsService: PatientsService;
	let settingsService: SettingsService;
	let withTenant: <T>(id: string, fn: (db: TenantDb) => Promise<T>) => Promise<T>;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		withTenant = async <T>(id: string, fn: (tx: TenantDb) => Promise<T>) =>
			db.transaction(async (tx) => {
				await tx.execute(
					drizzleSql`select set_config('app.current_tenant_id', ${id}, true)`
				);
				return fn(tx as TenantDb);
			});

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenant(id, (tx) => fn({ db: tx }))
		} as TenantContextService;

		contactsService = new ContactsService(tenantContext);
		patientsService = new PatientsService(tenantContext, new LocalFileStorage());
		settingsService = new SettingsService(tenantContext, {} as CryptoService);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Inline A', ${`inl-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Inline B', ${`inl-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Inline A', ${`inl-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Inline B', ${`inl-b-${tenantB.slice(0, 8)}`})
		`;

		contactTypeA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name) values (${tenantA}, 'Klinik A') returning id
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
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		for (const tenantId of [tenantA, tenantB]) {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
				await tx`delete from patients where tenant_id = ${tenantId}`;
				await tx`delete from contacts where tenant_id = ${tenantId}`;
				await tx`delete from finance_categories where tenant_id = ${tenantId}`;
				await tx`delete from contact_types where tenant_id = ${tenantId}`;
			});
		}
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	describe('create-contact', () => {
		it('happy path creates contact with denormalized type name on tenant A', async () => {
			const created = await withTenant(tenantA, (db) =>
				contactsService.createWithDb(db, tenantA, {
					display_name: 'Inline Contact',
					contact_type_id: contactTypeA,
					phone: '+905551112233'
				})
			);
			expect(created.tenant_id).toBe(tenantA);
			expect(created.display_name).toBe('Inline Contact');
			expect(created.contact_type_id).toBe(contactTypeA);
			expect(created.contact_type_name).toBe('Klinik A');
		});

		it('rejects missing required fields with schema validation', () => {
			expect(() =>
				parseBody(whatsappCreateContactSchema, { display_name: 'X' }, fakeReq())
			).toThrow(BadRequestException);
			expect(() =>
				parseBody(whatsappCreateContactSchema, { contact_type_id: contactTypeA }, fakeReq())
			).toThrow(BadRequestException);
		});

		it('returns 404 for unknown contact_type_id', async () => {
			await expect(
				withTenant(tenantA, (db) =>
					contactsService.createWithDb(db, tenantA, {
						display_name: 'Missing Type',
						contact_type_id: randomUUID()
					})
				)
			).rejects.toBeInstanceOf(NotFoundException);
		});

		it('Tenant A cannot use Tenant B contact_type_id (404)', async () => {
			await expect(
				withTenant(tenantA, (db) =>
					contactsService.createWithDb(db, tenantA, {
						display_name: 'Cross Tenant Type',
						contact_type_id: contactTypeB
					})
				)
			).rejects.toBeInstanceOf(NotFoundException);
		});

		it('created contact is not visible to Tenant B', async () => {
			const created = await withTenant(tenantA, (db) =>
				contactsService.createWithDb(db, tenantA, {
					display_name: 'Isolation Contact',
					contact_type_id: contactTypeA
				})
			);
			await expect(contactsService.get(tenantB, created.id)).rejects.toBeInstanceOf(
				NotFoundException
			);
		});
	});

	describe('create-patient', () => {
		it('happy path creates patient on tenant A', async () => {
			const created = await withTenant(tenantA, (db) =>
				patientsService.createWithDb(db, tenantA, {
					full_name: 'Inline Patient',
					phone: null,
					email: null,
					source: null,
					notes: null,
					assigned_user_id: null,
					contact_id: null,
					status: 'scheduled'
				})
			);
			expect(created.tenant_id).toBe(tenantA);
			expect(created.full_name).toBe('Inline Patient');
			expect(created.status).toBe('scheduled');
		});

		it('rejects missing full_name', () => {
			expect(() => parseBody(whatsappCreatePatientSchema, {}, fakeReq())).toThrow(
				BadRequestException
			);
		});

		it('created patient is not visible to Tenant B', async () => {
			const created = await withTenant(tenantA, (db) =>
				patientsService.createWithDb(db, tenantA, {
					full_name: 'Isolation Patient',
					phone: null,
					email: null,
					source: null,
					notes: null,
					assigned_user_id: null,
					contact_id: null,
					status: 'scheduled'
				})
			);
			await expect(patientsService.get(tenantB, created.id)).rejects.toBeInstanceOf(
				NotFoundException
			);
		});
	});

	describe('create-category', () => {
		it('happy path creates finance category on tenant A', async () => {
			const created = await withTenant(tenantA, (db) =>
				settingsService.createFinanceCategoryWithDb(db, tenantA, {
					kind: 'expense',
					name: `Inline Cat ${randomUUID().slice(0, 8)}`
				})
			);
			expect(created.tenant_id).toBe(tenantA);
			expect(created.kind).toBe('expense');
		});

		it('rejects missing required fields', () => {
			expect(() =>
				parseBody(whatsappCreateCategorySchema, { name: 'X' }, fakeReq())
			).toThrow(BadRequestException);
			expect(() =>
				parseBody(whatsappCreateCategorySchema, { kind: 'income' }, fakeReq())
			).toThrow(BadRequestException);
		});

		it('duplicate name+kind → 409 duplicate_type_name', async () => {
			const name = `Dup Cat ${randomUUID().slice(0, 8)}`;
			await withTenant(tenantA, (db) =>
				settingsService.createFinanceCategoryWithDb(db, tenantA, {
					kind: 'income',
					name
				})
			);
			try {
				await withTenant(tenantA, (db) =>
					settingsService.createFinanceCategoryWithDb(db, tenantA, {
						kind: 'income',
						name
					})
				);
				expect.unreachable('expected ConflictException');
			} catch (err) {
				expect(err).toBeInstanceOf(ConflictException);
				expect(conflictCode(err)).toBe('duplicate_type_name');
			}
		});

		it('Tenant B may reuse the same category name', async () => {
			const name = `Shared Name ${randomUUID().slice(0, 8)}`;
			const onA = await withTenant(tenantA, (db) =>
				settingsService.createFinanceCategoryWithDb(db, tenantA, {
					kind: 'income',
					name
				})
			);
			const onB = await withTenant(tenantB, (db) =>
				settingsService.createFinanceCategoryWithDb(db, tenantB, {
					kind: 'income',
					name
				})
			);
			expect(onA.tenant_id).toBe(tenantA);
			expect(onB.tenant_id).toBe(tenantB);
			expect(onA.name).toBe(onB.name);
		});

		it('Tenant A cannot see Tenant B category via list', async () => {
			const name = `B Only ${randomUUID().slice(0, 8)}`;
			const onB = await withTenant(tenantB, (db) =>
				settingsService.createFinanceCategoryWithDb(db, tenantB, {
					kind: 'expense',
					name
				})
			);
			const listed = await settingsService.listFinanceCategories(tenantA);
			expect(listed.items.some((c) => c.id === onB.id)).toBe(false);
		});
	});
});
