import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { ContactsService } from './contacts.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * Real-DB continuity for GET /v1/contacts keyset pagination
 * (`last_name ASC NULLS LAST, first_name ASC NULLS LAST, id ASC`).
 *
 * Unit coverage in `contact-list-cursor.spec.ts` only round-trips the cursor codec.
 * This spec proves page N+1 is the true continuation of page N (the failure class
 * fixed in 8c02d3b: load-more still keyed off created_at after phonebook reorder).
 *
 * Tenant mock mirrors production: drizzle transaction + SET LOCAL (is_local=true).
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

/** Fixed UUIDs so Demir/Ayşe ties resolve by id ASC and the hand-written order is stable. */
const IDS = {
	aliPipe: '11111111-1111-4111-8111-111111111101',
	aydinAli: '11111111-1111-4111-8111-111111111102',
	aydinZeynep: '11111111-1111-4111-8111-111111111103',
	demirAyseLo: '11111111-1111-4111-8111-111111111104',
	demirAyseHi: '11111111-1111-4111-8111-111111111105',
	yilmaz: '11111111-1111-4111-8111-111111111106',
	celik: '11111111-1111-4111-8111-111111111107',
	ozturk: '11111111-1111-4111-8111-111111111108',
	unal: '11111111-1111-4111-8111-111111111109',
	gunes: '11111111-1111-4111-8111-111111111110',
	inan: '11111111-1111-4111-8111-111111111111',
	sahin: '11111111-1111-4111-8111-111111111112',
	klinikAlpha: '11111111-1111-4111-8111-111111111113',
	klinikBeta: '11111111-1111-4111-8111-111111111114',
	zulu: '11111111-1111-4111-8111-111111111115'
} as const;

/**
 * Phonebook order under the project's Postgres collation (en_US.utf8):
 * ASCII-leading surnames, then Ç/Ö/Ü/Ğ/İ/Ş code points, then NULL last_name
 * (institution rows) ordered by display name.
 */
const EXPECTED_ORDER = [
	IDS.aliPipe,
	IDS.aydinAli,
	IDS.aydinZeynep,
	IDS.demirAyseLo,
	IDS.demirAyseHi,
	IDS.yilmaz,
	IDS.celik,
	IDS.ozturk,
	IDS.unal,
	IDS.gunes,
	IDS.inan,
	IDS.sahin,
	IDS.klinikAlpha,
	IDS.klinikBeta,
	IDS.zulu
] as const;

async function withTenantDb<T>(tenantId: string, fn: (db: TenantDb) => Promise<T>): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(
			drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`
		);
		return fn(tx as TenantDb);
	});
}

describe('contacts list keyset continuity', () => {
	const tenantId = randomUUID();
	let service: ContactsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Keyset Tenant', ${`keyset-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Keyset Tenant', ${`keyset-${tenantId.slice(0, 8)}`})
		`;

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values
					(${tenantId}, 'Hasta', 0),
					(${tenantId}, 'Klinik', 1)
			`;

			const hastaType = (
				await tx`select id from contact_types where tenant_id = ${tenantId} and name = 'Hasta' limit 1`
			)[0]!.id as string;
			const klinikType = (
				await tx`select id from contact_types where tenant_id = ${tenantId} and name = 'Klinik' limit 1`
			)[0]!.id as string;

			await tx`
				insert into contacts (
					id, tenant_id, contact_type_id, contact_type_name,
					first_name, last_name, display_name
				)
				values
					(${IDS.aliPipe}, ${tenantId}, ${hastaType}, 'Hasta', 'Mehmet', 'Ali|Kaya', 'Mehmet Ali|Kaya'),
					(${IDS.aydinAli}, ${tenantId}, ${hastaType}, 'Hasta', 'Ali', 'Aydın', 'Ali Aydın'),
					(${IDS.aydinZeynep}, ${tenantId}, ${hastaType}, 'Hasta', 'Zeynep', 'Aydın', 'Zeynep Aydın'),
					(${IDS.demirAyseLo}, ${tenantId}, ${hastaType}, 'Hasta', 'Ayşe', 'Demir', 'Ayşe Demir'),
					(${IDS.demirAyseHi}, ${tenantId}, ${hastaType}, 'Hasta', 'Ayşe', 'Demir', 'Ayşe Demir'),
					(${IDS.yilmaz}, ${tenantId}, ${hastaType}, 'Hasta', 'Can', 'Yılmaz', 'Can Yılmaz'),
					(${IDS.celik}, ${tenantId}, ${hastaType}, 'Hasta', 'Emre', 'Çelik', 'Emre Çelik'),
					(${IDS.ozturk}, ${tenantId}, ${hastaType}, 'Hasta', 'Fatma', 'Öztürk', 'Fatma Öztürk'),
					(${IDS.unal}, ${tenantId}, ${hastaType}, 'Hasta', 'Hasan', 'Ünal', 'Hasan Ünal'),
					(${IDS.gunes}, ${tenantId}, ${hastaType}, 'Hasta', 'Leyla', 'Ğüneş', 'Leyla Ğüneş'),
					(${IDS.inan}, ${tenantId}, ${hastaType}, 'Hasta', 'Nur', 'İnan', 'Nur İnan'),
					(${IDS.sahin}, ${tenantId}, ${hastaType}, 'Hasta', 'Berk', 'Şahin', 'Berk Şahin'),
					(${IDS.klinikAlpha}, ${tenantId}, ${klinikType}, 'Klinik', 'Klinik Alpha', null, 'Klinik Alpha'),
					(${IDS.klinikBeta}, ${tenantId}, ${klinikType}, 'Klinik', 'Klinik Beta', null, 'Klinik Beta'),
					(${IDS.zulu}, ${tenantId}, ${klinikType}, 'Klinik', 'Zulu Clinic', null, 'Zulu Clinic')
			`;
		});

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantDb(id, (db) => fn({ db }))
		} as TenantContextService;

		service = new ContactsService(tenantContext, new LocalFileStorage());
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantId]);
		await closeDb();
	});

	it('orders by last_name, first_name, id (hand-written expected sequence)', async () => {
		const full = await service.list(tenantId, { limit: 100 });
		expect(full.items.map((c) => c.id)).toEqual([...EXPECTED_ORDER]);
		expect(full.total_count).toBe(EXPECTED_ORDER.length);
		expect(full.next_cursor).toBeNull();
	});

	it.each([2, 5] as const)(
		'limit=%i walk matches full list with no duplicates, gaps, or trailing cursor',
		async (limit) => {
			expect(EXPECTED_ORDER.length).toBeGreaterThanOrEqual(limit * 3);

			const full = await service.list(tenantId, { limit: 100 });
			const fullIds = full.items.map((c) => c.id);

			const collected: string[] = [];
			let cursor: string | undefined;
			let pages = 0;
			let lastNextCursor: string | null = null;

			for (;;) {
				const page = await service.list(tenantId, {
					limit,
					...(cursor ? { cursor } : {})
				});
				pages += 1;
				collected.push(...page.items.map((c) => c.id));
				lastNextCursor = page.next_cursor;
				if (!page.next_cursor) break;
				cursor = page.next_cursor;
				expect(pages).toBeLessThan(100);
			}

			expect(collected).toEqual(fullIds);
			expect(collected).toEqual([...EXPECTED_ORDER]);
			expect(new Set(collected).size).toBe(collected.length);
			expect(collected).toHaveLength(EXPECTED_ORDER.length);
			expect(lastNextCursor).toBeNull();
			expect(pages).toBe(Math.ceil(EXPECTED_ORDER.length / limit));
		}
	);
});
