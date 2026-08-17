import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { NotFoundException } from '@nestjs/common';
import {
	addCalendarDays,
	incentiveFileCreateSchema,
	utcTodayIsoDate
} from '@verimaya/shared';
import { CryptoService } from '../common/crypto.service';
import { closeDb, getDb } from '../db/client';
import { ContactsService } from '../contacts/contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { SettingsService } from '../settings/settings.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { IncentivesService } from './incentives.service';
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

describe('incentives tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactTypeA: string;
	let contactTypeB: string;
	let patientA: string;
	let patientB: string;
	let fileA: string;
	let fileB: string;
	let incentivesService: IncentivesService;
	let settingsService: SettingsService;
	let contactsService: ContactsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const dbHandle = getDb(databaseUrl);
		const { sql } = dbHandle;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, (tdb) => fn({ db: tdb }))
		} as TenantContextService;

		settingsService = new SettingsService(tenantContext, new CryptoService());
		incentivesService = new IncentivesService(tenantContext, settingsService);
		contactsService = new ContactsService(tenantContext, new LocalFileStorage());

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

		contactTypeA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantA}, 'Hasta', 0)
				returning id
			`;
			return row!.id as string;
		});
		contactTypeB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantB}, 'Hasta', 0)
				returning id
			`;
			return row!.id as string;
		});

		patientA = await withTenantSession(tenantA, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Patient A'
			});
			return p.id;
		});
		patientB = await withTenantSession(tenantB, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantB, {
				contact_type_id: contactTypeB,
				first_name: 'Patient B'
			});
			return p.id;
		});

		fileA = await withTenantSession(tenantA, async (tdb) => {
			const f = await incentivesService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				payment_date: '2026-01-15',
				note: 'A file'
			});
			return f.id;
		});
		fileB = await withTenantSession(tenantB, async (tdb) => {
			const f = await incentivesService.createWithDb(tdb, tenantB, {
				contact_id: patientB,
				payment_date: '2026-02-01',
				note: 'B file'
			});
			return f.id;
		});
	}, 60_000);

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant B list does not include Tenant A incentive files', async () => {
		const page = await incentivesService.list(tenantB, { limit: 50 });
		expect(page.items.map((i) => i.id)).toEqual([fileB]);
		expect(page.items.every((i) => i.tenant_id === tenantB)).toBe(true);
	});

	it('Tenant B cannot update Tenant A file (404)', async () => {
		await expect(
			withTenantSession(tenantB, (tdb) =>
				incentivesService.updateWithDb(tdb, fileA, { note: 'hijack' })
			)
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('Tenant B cannot delete Tenant A file (404)', async () => {
		await expect(
			withTenantSession(tenantB, (tdb) =>
				incentivesService.softDeleteWithDb(tdb, tenantB, fileA, {
					actorId: null,
					actorDisplayName: 'test'
				})
			)
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('deadline_at is server-computed; client deadline_at is stripped by create schema', () => {
		const parsed = incentiveFileCreateSchema.safeParse({
			contact_id: patientA,
			payment_date: '2026-01-15',
			deadline_at: '2099-12-31',
			note: null
		});
		expect(parsed.success).toBe(false);
	});

	it('deadline_at uses tenant setting days at create time', async () => {
		await settingsService.saveIncentiveDeadline(
			tenantA,
			{ days: 30 },
			{ actorId: null, actorDisplayName: 'tester' }
		);
		const created = await withTenantSession(tenantA, (tdb) =>
			incentivesService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				payment_date: '2026-03-01'
			})
		);
		expect(created.deadline_at).toBe(addCalendarDays('2026-03-01', 30));
		// restore default for later tests
		await settingsService.resetIncentiveDeadline(tenantA, {
			actorId: null,
			actorDisplayName: 'tester'
		});
	});

	it('changing setting does not alter existing deadline_at', async () => {
		const before = await withTenantSession(tenantA, async (tdb) => {
			const f = await incentivesService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				payment_date: '2026-04-01'
			});
			return f;
		});
		const frozen = before.deadline_at;

		await settingsService.saveIncentiveDeadline(
			tenantA,
			{ days: 10 },
			{ actorId: null, actorDisplayName: 'tester' }
		);

		const page = await incentivesService.list(tenantA, { limit: 100 });
		const still = page.items.find((i) => i.id === before.id);
		expect(still?.deadline_at).toBe(frozen);

		await settingsService.resetIncentiveDeadline(tenantA, {
			actorId: null,
			actorDisplayName: 'tester'
		});
	});

	it('due_within_days filters to deadlines on or before today+N', async () => {
		const today = utcTodayIsoDate();
		// Ödeme 150 gün önce yapılmışsa varsayılan 180 günlük süreyle son tarih ≈ bugün+30,
		// yani 60 günlük pencerenin İÇİNDE. Ödemeyi bugün girersek son tarih bugün+180 olur
		// ve pencerenin dışında kalır — filtre o yüzden gerçekten sınanmış olmaz.
		const paidLongAgo = new Date(Date.now() - 150 * 86_400_000).toISOString().slice(0, 10);
		const near = await withTenantSession(tenantA, (tdb) =>
			incentivesService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				payment_date: paidLongAgo,
				note: 'near'
			})
		);
		// Force a far deadline via raw update (bypasses create math)
		const { sql } = getDb(databaseUrl);
		const farId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into incentive_files (
					tenant_id, contact_id, contact_display_name, payment_date, deadline_at, status, documents
				) values (
					${tenantA}, ${patientA}, 'Patient A', ${today}, '2099-01-01', 'open', '[]'::jsonb
				)
				returning id
			`;
			return row!.id as string;
		});

		const page = await incentivesService.list(tenantA, { limit: 100, due_within_days: 60 });
		const ids = page.items.map((i) => i.id);
		expect(ids).toContain(near.id);
		expect(ids).not.toContain(farId);
	});

	it('soft-deleted file disappears from list', async () => {
		const created = await withTenantSession(tenantA, (tdb) =>
			incentivesService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				payment_date: '2026-05-01',
				note: 'to delete'
			})
		);
		await withTenantSession(tenantA, (tdb) =>
			incentivesService.softDeleteWithDb(tdb, tenantA, created.id, {
				actorId: null,
				actorDisplayName: 'tester'
			})
		);
		const page = await incentivesService.list(tenantA, { limit: 100 });
		expect(page.items.map((i) => i.id)).not.toContain(created.id);
	});
});
