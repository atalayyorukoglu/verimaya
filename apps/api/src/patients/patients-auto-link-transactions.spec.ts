import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { PatientsService } from './patients.service';

/**
 * GAP-F09-22 (G-22): auto-link unassigned transactions by patient.contact_id.
 * Tenant mock mirrors production: drizzle `db.transaction` + SET LOCAL (is_local=true).
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('GAP-F09-22 patients auto-link-transactions', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactTypeA: string;
	let contactTypeB: string;
	let contactA: string;
	let contactAOther: string;
	let contactB: string;
	let patientA: string;
	let patientA2: string;
	let patientANoContact: string;
	let patientB: string;
	let txnLinkable1: string;
	let txnLinkable2: string;
	let txnAlreadyLinked: string;
	let txnSoftDeleted: string;
	let txnOtherContact: string;
	let txnBUnlinked: string;
	let service: PatientsService;

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

		service = new PatientsService(tenantContext, new LocalFileStorage());

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'AutoLink A', ${`alink-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'AutoLink B', ${`alink-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'AutoLink A', ${`alink-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'AutoLink B', ${`alink-b-${tenantB.slice(0, 8)}`})
		`;

		contactTypeA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name) values (${tenantA}, 'Hasta A') returning id
			`;
			return row!.id as string;
		});
		contactTypeB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name) values (${tenantB}, 'Hasta B') returning id
			`;
			return row!.id as string;
		});

		contactA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, display_name)
				values (${tenantA}, ${contactTypeA}, 'Hasta A', 'Contact A')
				returning id
			`;
			return row!.id as string;
		});
		contactAOther = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, display_name)
				values (${tenantA}, ${contactTypeA}, 'Hasta A', 'Contact A Other')
				returning id
			`;
			return row!.id as string;
		});
		contactB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, display_name)
				values (${tenantB}, ${contactTypeB}, 'Hasta B', 'Contact B')
				returning id
			`;
			return row!.id as string;
		});

		patientA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into patients (tenant_id, full_name, contact_id)
				values (${tenantA}, 'Patient A', ${contactA})
				returning id
			`;
			return row!.id as string;
		});
		patientA2 = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into patients (tenant_id, full_name, contact_id)
				values (${tenantA}, 'Patient A2', ${contactA})
				returning id
			`;
			return row!.id as string;
		});
		patientANoContact = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into patients (tenant_id, full_name)
				values (${tenantA}, 'Patient A No Contact')
				returning id
			`;
			return row!.id as string;
		});
		patientB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into patients (tenant_id, full_name, contact_id)
				values (${tenantB}, 'Patient B', ${contactB})
				returning id
			`;
			return row!.id as string;
		});

		txnLinkable1 = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, currency, contact_id
				) values (
					${tenantA}, 'income', 'Linkable 1', '2026-08-01', 'paid', 10000, 'TRY', ${contactA}
				)
				returning id
			`;
			return row!.id as string;
		});
		txnLinkable2 = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, currency, contact_id
				) values (
					${tenantA}, 'income', 'Linkable 2', '2026-08-02', 'paid', 20000, 'TRY', ${contactA}
				)
				returning id
			`;
			return row!.id as string;
		});
		txnAlreadyLinked = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, currency,
					contact_id, patient_id, patient_display_name
				) values (
					${tenantA}, 'income', 'Already linked', '2026-08-03', 'paid', 30000, 'TRY',
					${contactA}, ${patientA2}, 'Patient A2'
				)
				returning id
			`;
			return row!.id as string;
		});
		txnSoftDeleted = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, currency,
					contact_id, deleted_at
				) values (
					${tenantA}, 'income', 'Soft deleted', '2026-08-04', 'paid', 40000, 'TRY',
					${contactA}, now()
				)
				returning id
			`;
			return row!.id as string;
		});
		txnOtherContact = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, currency, contact_id
				) values (
					${tenantA}, 'income', 'Other contact', '2026-08-05', 'paid', 50000, 'TRY',
					${contactAOther}
				)
				returning id
			`;
			return row!.id as string;
		});
		txnBUnlinked = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, currency, contact_id
				) values (
					${tenantB}, 'income', 'Tenant B unlinked', '2026-08-06', 'paid', 60000, 'TRY',
					${contactB}
				)
				returning id
			`;
			return row!.id as string;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		for (const tenantId of [tenantA, tenantB]) {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
				await tx`delete from transactions where tenant_id = ${tenantId}`;
				await tx`delete from patients where tenant_id = ${tenantId}`;
				await tx`delete from contacts where tenant_id = ${tenantId}`;
				await tx`delete from contact_types where tenant_id = ${tenantId}`;
			});
		}
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('links N matching unassigned transactions and returns the real updated count', async () => {
		const result = await service.autoLinkTransactions(tenantA, patientA);
		expect(result.updated).toBe(2);

		const { sql } = getDb(databaseUrl);
		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select id, patient_id, patient_display_name
				from transactions
				where id in (${txnLinkable1}, ${txnLinkable2})
				order by title
			`;
		});
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.patient_id).toBe(patientA);
			expect(row.patient_display_name).toBe('Patient A');
		}

		const second = await service.autoLinkTransactions(tenantA, patientA);
		expect(second.updated).toBe(0);
	});

	it('does not touch transactions already linked to another patient', async () => {
		const { sql } = getDb(databaseUrl);
		const [row] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select patient_id, patient_display_name
				from transactions where id = ${txnAlreadyLinked}
			`;
		});
		expect(row!.patient_id).toBe(patientA2);
		expect(row!.patient_display_name).toBe('Patient A2');
	});

	it('skips soft-deleted transactions', async () => {
		const { sql } = getDb(databaseUrl);
		const [row] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select patient_id, deleted_at
				from transactions where id = ${txnSoftDeleted}
			`;
		});
		expect(row!.patient_id).toBeNull();
		expect(row!.deleted_at).not.toBeNull();
	});

	it('does not link transactions with a different contact_id', async () => {
		const { sql } = getDb(databaseUrl);
		const [row] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select patient_id from transactions where id = ${txnOtherContact}`;
		});
		expect(row!.patient_id).toBeNull();
	});

	it('returns updated: 0 when the patient has no contact_id', async () => {
		const result = await service.autoLinkTransactions(tenantA, patientANoContact);
		expect(result.updated).toBe(0);
	});

	it('Tenant A call does not link Tenant B unassigned transactions', async () => {
		await service.autoLinkTransactions(tenantA, patientA);

		const { sql } = getDb(databaseUrl);
		const [row] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`select patient_id from transactions where id = ${txnBUnlinked}`;
		});
		expect(row!.patient_id).toBeNull();
	});

	it('Tenant A calling with Tenant B patient id returns 404', async () => {
		await expect(service.autoLinkTransactions(tenantA, patientB)).rejects.toBeInstanceOf(
			NotFoundException
		);
	});
});
