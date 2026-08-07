import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { TenantContextService } from '../tenant/tenant-context.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { PatientsService } from './patients.service';

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

describe('patient finance summary tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let patientA: string;
	let patientB: string;
	let patientsService: PatientsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`})
		`;

		patientA = await withTenantSession(tenantA, async () => {
			const [row] = await sql`
				insert into patients (tenant_id, full_name)
				values (${tenantA}, 'Patient A')
				returning id
			`;
			return row!.id as string;
		});

		patientB = await withTenantSession(tenantB, async () => {
			const [row] = await sql`
				insert into patients (tenant_id, full_name)
				values (${tenantB}, 'Patient B')
				returning id
			`;
			return row!.id as string;
		});

		await withTenantSession(tenantA, async () => {
			await sql`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, patient_id
				)
				values
					(${tenantA}, 'income', 'A income paid', '2026-01-10', 'paid', 10000, 10000, 10000, 'TRY', ${patientA}),
					(${tenantA}, 'income', 'A income partial', '2026-01-11', 'partial', 8000, 8000, 3000, 'TRY', ${patientA}),
					(${tenantA}, 'expense', 'A expense', '2026-01-12', 'paid', 2000, 2000, 2000, 'TRY', ${patientA})
			`;
		});

		await withTenantSession(tenantB, async () => {
			await sql`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, patient_id
				)
				values
					(${tenantB}, 'income', 'B income', '2026-01-10', 'paid', 50000, 50000, 50000, 'TRY', ${patientB})
			`;
		});

		const tenantContext = {
			withTenant: async <T>(tenantId: string, fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>) =>
				withTenantSession(tenantId, () => fn({ tx: sql, db }))
		} as TenantContextService;

		patientsService = new PatientsService(tenantContext, new LocalFileStorage());
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantA, async () => {
			await sql`delete from transactions where tenant_id = ${tenantA}`;
			await sql`delete from patients where tenant_id = ${tenantA}`;
		});
		await withTenantSession(tenantB, async () => {
			await sql`delete from transactions where tenant_id = ${tenantB}`;
			await sql`delete from patients where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A finance summary excludes Tenant B patient transactions', async () => {
		const summary = await patientsService.financeSummary(tenantA, patientA);

		expect(summary.income_base).toBe(18000);
		expect(summary.expense_base).toBe(2000);
		expect(summary.net_base).toBe(16000);
		expect(summary.paid_base).toBe(13000);
		expect(summary.outstanding_base).toBe(5000);
		expect(summary.transaction_count).toBe(3);
	});

	it('Tenant A cannot read Tenant B patient finance summary', async () => {
		await expect(patientsService.financeSummary(tenantA, patientB)).rejects.toBeInstanceOf(
			NotFoundException
		);
	});

	it('Tenant B finance summary excludes Tenant A patient transactions', async () => {
		const summary = await patientsService.financeSummary(tenantB, patientB);

		expect(summary.income_base).toBe(50000);
		expect(summary.expense_base).toBe(0);
		expect(summary.net_base).toBe(50000);
		expect(summary.paid_base).toBe(50000);
		expect(summary.outstanding_base).toBe(0);
		expect(summary.transaction_count).toBe(1);
	});
});
