import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from './client';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const require = createRequire(import.meta.url);
const {
	applyAll,
	attachContactLegacy,
	loadFixtureFile,
	mapFixture,
	toMinor,
	DEFAULT_FIXTURE
} = require('../../scripts/etl.js') as {
	applyAll: (
		sql: unknown,
		tenantId: string,
		mapped: unknown,
		batchSize: number,
		opts?: { fxBackfill?: boolean; fetchFn?: typeof fetch }
	) => Promise<{
		contacts: { inserted: number; skipped: number };
		patients: { inserted: number; skipped: number };
		appointments: { inserted: number; skipped: number };
		transactions: { inserted: number; skipped: number };
		files: { inserted: number; skipped: number };
		case_notes: { inserted: number; skipped: number };
		errors: string[];
	}>;
	attachContactLegacy: (mapped: unknown, source: unknown) => unknown;
	loadFixtureFile: (path: string) => unknown;
	mapFixture: (source: unknown, tenantId: string) => {
		contacts: unknown[];
		patients: unknown[];
		appointments: unknown[];
		transactions: { verimaya: { amount: number | null; title: string | null } }[];
		files: unknown[];
		case_notes: unknown[];
	};
	toMinor: (major: number) => number;
	DEFAULT_FIXTURE: string;
};

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const fixturePath = path.resolve(path.dirname(DEFAULT_FIXTURE), 'etl-sample.json');

describe('ETL apply layer 1+2 (Adım 28–29)', () => {
	const tenantId = randomUUID();
	let sql: ReturnType<typeof getDb>['sql'];

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		({ sql } = getDb(databaseUrl));

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'ETL Tenant', ${`etl-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'ETL Tenant', ${`etl-${tenantId.slice(0, 8)}`})
		`;
	});

	afterAll(async () => {
		await purgeTenantFixtures(sql, [tenantId]);
		await closeDb();
	});

	it('toMinor: 100 TL → 10000', () => {
		expect(toMinor(100)).toBe(10000);
		expect(toMinor(1500)).toBe(150000);
		expect(toMinor(450.5)).toBe(45050);
	});

	it('applies fixture then second run inserts 0; money sample matches', async () => {
		const source = loadFixtureFile(fixturePath);
		const mapped = attachContactLegacy(mapFixture(source, tenantId), source) as ReturnType<
			typeof mapFixture
		>;

		const mockFetch: typeof fetch = async (input) => {
			const url = String(input);
			const from = /from=([A-Z]+)/.exec(url)?.[1] ?? 'EUR';
			const rates: Record<string, number> = { EUR: 35.5, USD: 32, GBP: 42 };
			return new Response(
				JSON.stringify({
					date: '2026-07-14',
					rates: { TRY: rates[from] ?? 30 }
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		};

		const first = await applyAll(sql, tenantId, mapped, 1000, {
			fxBackfill: true,
			fetchFn: mockFetch
		});
		expect(first.contacts.inserted).toBe(mapped.contacts.length);
		expect(first.patients.inserted).toBe(mapped.patients.length);
		expect(first.appointments.inserted).toBe(mapped.appointments.length);
		expect(first.transactions.inserted).toBe(mapped.transactions.length);
		expect(first.files.inserted).toBe(mapped.files.length);
		expect(first.case_notes.inserted).toBe(mapped.case_notes.length);

		const money = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`
				select title, amount, currency, paid_amount, case_contact_id, contact_id,
					responsible_contact_id, amount_base
				from transactions
				where title = 'Örnek 100 TL'
			`;
		});
		expect(money).toHaveLength(1);
		expect(money[0]!.amount).toBe(10000);
		expect(money[0]!.paid_amount).toBe(10000);
		expect(money[0]!.currency).toBe('TRY');

		const gbp = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`
				select amount, currency, amount_base, case_contact_id, contact_id
				from transactions where title = 'Operasyon peşinat'
			`;
		});
		expect(gbp[0]!.amount).toBe(150000);
		expect(gbp[0]!.currency).toBe('GBP');
		expect(gbp[0]!.amount_base).toBe(5250000);
		expect(gbp[0]!.case_contact_id).toBeTruthy();
		expect(gbp[0]!.contact_id).toBeNull();

		const hotel = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`
				select case_contact_id, contact_id, responsible_contact_id, amount_base, title
				from transactions where title = 'Otel'
			`;
		});
		expect(hotel[0]!.case_contact_id).toBeTruthy();
		expect(hotel[0]!.contact_id).toBeTruthy();
		expect(hotel[0]!.responsible_contact_id).toBeTruthy();
		expect(hotel[0]!.case_contact_id).not.toBe(hotel[0]!.contact_id);
		expect(hotel[0]!.amount_base).toBe(Math.round(12000 * 35.5));

		const placeholder = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`
				select title, case_contact_id, contact_id
				from transactions
				where description like 'Eski ETL placeholder%'
			`;
		});
		expect(placeholder).toHaveLength(1);
		expect(placeholder[0]!.title).toBeNull();
		expect(placeholder[0]!.case_contact_id).toBeTruthy();
		expect(placeholder[0]!.contact_id).toBeTruthy();

		const second = await applyAll(sql, tenantId, mapped, 1000, {
			fxBackfill: true,
			fetchFn: mockFetch
		});
		expect(second.contacts.inserted).toBe(0);
		expect(second.patients.inserted).toBe(0);
		expect(second.appointments.inserted).toBe(0);
		expect(second.transactions.inserted).toBe(0);
		expect(second.files.inserted).toBe(0);
		expect(second.case_notes.inserted).toBe(0);
		expect(second.appointments.skipped).toBe(mapped.appointments.length);
		expect(second.transactions.skipped).toBe(mapped.transactions.length);
	});
});
