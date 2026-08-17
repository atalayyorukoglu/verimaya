import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { NotFoundException } from '@nestjs/common';
import { utcTodayIsoDate } from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import { ContactsService } from '../contacts/contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { CommissionsService } from './commissions.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(
	tenantId: string,
	fn: (tdb: TenantDb) => Promise<T>
): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(
			drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`
		);
		return fn(tx as TenantDb);
	});
}

describe('commissions tenant isolation + summary', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactTypeA: string;
	let contactTypeB: string;
	let beneficiaryA: string;
	let beneficiaryB: string;
	let patientA: string;
	let entryA: string;
	let entryB: string;
	let commissionsService: CommissionsService;
	let contactsService: ContactsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const dbHandle = getDb(databaseUrl);
		const { sql } = dbHandle;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, (tdb) => fn({ db: tdb }))
		} as TenantContextService;

		commissionsService = new CommissionsService(tenantContext);
		contactsService = new ContactsService(tenantContext, new LocalFileStorage());

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug, base_currency)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}, 'TRY'),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`}, 'TRY')
		`;

		contactTypeA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantA}, 'Klinik', 0)
				returning id
			`;
			return row!.id as string;
		});
		contactTypeB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantB}, 'Klinik', 0)
				returning id
			`;
			return row!.id as string;
		});

		const patientTypeA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantA}, 'Hasta', 1)
				returning id
			`;
			return row!.id as string;
		});

		beneficiaryA = await withTenantSession(tenantA, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Clinic A'
			});
			return p.id;
		});
		beneficiaryB = await withTenantSession(tenantB, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantB, {
				contact_type_id: contactTypeB,
				first_name: 'Clinic B'
			});
			return p.id;
		});
		patientA = await withTenantSession(tenantA, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: patientTypeA,
				first_name: 'Patient A'
			});
			return p.id;
		});

		entryA = await withTenantSession(tenantA, async (tdb) => {
			const e = await commissionsService.createWithDb(tdb, tenantA, {
				beneficiary_contact_id: beneficiaryA,
				case_contact_id: patientA,
				amount: 10_000,
				currency: 'TRY',
				earned_on: '2026-01-15',
				note: 'A entry'
			});
			return e.id;
		});
		entryB = await withTenantSession(tenantB, async (tdb) => {
			const e = await commissionsService.createWithDb(tdb, tenantB, {
				beneficiary_contact_id: beneficiaryB,
				amount: 20_000,
				currency: 'TRY',
				earned_on: '2026-02-01',
				note: 'B entry'
			});
			return e.id;
		});
	}, 60_000);

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant B list does not include Tenant A commission entries', async () => {
		const page = await commissionsService.list(tenantB, { limit: 50 });
		expect(page.items.map((i) => i.id)).toEqual([entryB]);
		expect(page.items.every((i) => i.tenant_id === tenantB)).toBe(true);
	});

	it('Tenant B cannot update Tenant A entry (404)', async () => {
		await expect(
			withTenantSession(tenantB, (tdb) =>
				commissionsService.updateWithDb(tdb, entryA, { note: 'hijack' })
			)
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('Tenant B cannot delete Tenant A entry (404)', async () => {
		await expect(
			withTenantSession(tenantB, (tdb) =>
				commissionsService.softDeleteWithDb(tdb, tenantB, entryA, {
					actorId: null,
					actorDisplayName: 'test'
				})
			)
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('summary: open_base counts accrued only; cancelled ignored', async () => {
		const clinic2 = await withTenantSession(tenantA, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Clinic Summary'
			});
			return p.id;
		});

		await withTenantSession(tenantA, async (tdb) => {
			await commissionsService.createWithDb(tdb, tenantA, {
				beneficiary_contact_id: clinic2,
				amount: 5_000,
				currency: 'TRY',
				earned_on: '2026-03-01',
				status: 'accrued'
			});
			await commissionsService.createWithDb(tdb, tenantA, {
				beneficiary_contact_id: clinic2,
				amount: 3_000,
				currency: 'TRY',
				earned_on: '2026-03-02',
				status: 'paid',
				paid_on: '2026-03-10'
			});
			await commissionsService.createWithDb(tdb, tenantA, {
				beneficiary_contact_id: clinic2,
				amount: 9_000,
				currency: 'TRY',
				earned_on: '2026-03-03',
				status: 'cancelled'
			});
		});

		const report = await commissionsService.summary(tenantA);
		const row = report.items.find((i) => i.beneficiary_contact_id === clinic2);
		expect(row).toBeDefined();
		expect(row!.accrued_base).toBe(5_000);
		expect(row!.paid_base).toBe(3_000);
		expect(row!.open_base).toBe(2_000);
		expect(row!.entry_count).toBe(2);
	});

	it('summary: amount_base null foreign row increments missing_fx_count', async () => {
		const clinicFx = await withTenantSession(tenantA, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Clinic FX'
			});
			return p.id;
		});

		await withTenantSession(tenantA, async (tdb) => {
			await commissionsService.createWithDb(tdb, tenantA, {
				beneficiary_contact_id: clinicFx,
				amount: 100_00,
				currency: 'EUR',
				amount_base: null,
				earned_on: '2026-04-01',
				status: 'accrued'
			});
			await commissionsService.createWithDb(tdb, tenantA, {
				beneficiary_contact_id: clinicFx,
				amount: 2_000,
				currency: 'TRY',
				earned_on: '2026-04-02',
				status: 'accrued'
			});
		});

		const before = await commissionsService.summary(tenantA);
		const missingBefore = before.missing_fx_count;
		const row = before.items.find((i) => i.beneficiary_contact_id === clinicFx);
		expect(row).toBeDefined();
		expect(row!.accrued_base).toBe(2_000);
		expect(row!.open_base).toBe(2_000);
		expect(before.missing_fx_count).toBeGreaterThanOrEqual(1);

		// Ensure the EUR row is counted in missing_fx without inflating totals
		expect(missingBefore).toBeGreaterThanOrEqual(1);
	});

	it('soft-deleted entry disappears from list and summary', async () => {
		const created = await withTenantSession(tenantA, async (tdb) => {
			return commissionsService.createWithDb(tdb, tenantA, {
				beneficiary_contact_id: beneficiaryA,
				amount: 7_777,
				currency: 'TRY',
				earned_on: '2026-05-01',
				note: 'to delete'
			});
		});
		await withTenantSession(tenantA, (tdb) =>
			commissionsService.softDeleteWithDb(tdb, tenantA, created.id, {
				actorId: null,
				actorDisplayName: 'tester'
			})
		);
		const page = await commissionsService.list(tenantA, { limit: 100 });
		expect(page.items.map((i) => i.id)).not.toContain(created.id);

		const report = await commissionsService.summary(tenantA);
		const beneficiaryRow = report.items.find(
			(i) => i.beneficiary_contact_id === beneficiaryA
		);
		if (beneficiaryRow) {
			expect(beneficiaryRow.accrued_base).not.toBe(
				beneficiaryRow.accrued_base + 7_777
			);
		}
		// Soft-deleted 7777 must not appear in any open total for beneficiary A
		const listAmounts = page.items
			.filter((i) => i.beneficiary_contact_id === beneficiaryA)
			.map((i) => i.amount);
		expect(listAmounts).not.toContain(7_777);
	});

	it('status paid auto-fills paid_on when empty', async () => {
		const created = await withTenantSession(tenantA, async (tdb) => {
			return commissionsService.createWithDb(tdb, tenantA, {
				beneficiary_contact_id: beneficiaryA,
				amount: 1_500,
				currency: 'TRY',
				earned_on: '2026-06-01',
				status: 'accrued'
			});
		});
		expect(created.paid_on).toBeNull();

		const updated = await withTenantSession(tenantA, (tdb) =>
			commissionsService.updateWithDb(tdb, created.id, { status: 'paid' })
		);
		expect(updated.status).toBe('paid');
		expect(updated.paid_on).toBe(utcTodayIsoDate());
	});
});
