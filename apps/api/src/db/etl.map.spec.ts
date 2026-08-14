import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
	DEFAULT_FIXTURE,
	attachContactLegacy,
	enrichMappedFx,
	loadFixtureFile,
	mapFixture,
	normalizeTransactionTitle,
	parseArgs,
	resolveFxSnapshot,
	toMinor
} = require('../../scripts/etl.js') as {
	DEFAULT_FIXTURE: string;
	attachContactLegacy: (mapped: unknown, source: unknown) => {
		transactions: Array<{
			legacy_id: string;
			_case_legacy: string | null;
			_contact_legacy: string | null;
			_responsible_legacy: string | null;
			_amount_major: number | null;
			_counterparty_major: number | null;
			_equivalent_currency: string | null;
			verimaya: {
				title: string | null;
				amount: number | null;
				currency: string;
				occurred_on: string;
				case_contact_id: string | null;
				contact_id: string | null;
				responsible_contact_id: string | null;
				amount_base: number | null;
				base_currency: string | null;
				fx_rate: number | null;
				fx_dated: string | null;
			};
		}>;
		contacts: unknown[];
		patients: unknown[];
	};
	enrichMappedFx: (
		transactions: unknown[],
		opts: {
			tenantBase: string;
			fxBackfill?: boolean;
			getRate?: (
				on: string,
				from: string,
				to: string
			) => Promise<{ rate: number; rateDate: string } | null>;
		}
	) => Promise<{
		tracker_snapshot: number;
		ecb_filled: number;
		missing_rate: string[];
		native_or_skipped: number;
	}>;
	loadFixtureFile: (p: string) => unknown;
	mapFixture: (source: unknown, tenantId: string) => unknown;
	normalizeTransactionTitle: (title: string | null | undefined) => string | null;
	parseArgs: (argv: string[]) => { fxBackfill: boolean };
	resolveFxSnapshot: (input: {
		currency: string;
		amountMajor: number;
		occurredOn: string;
		counterpartyMajor: number | null;
		equivalentCurrency: string | null;
		tenantBase: string;
	}) => {
		amount_base: number | null;
		base_currency: string | null;
		fx_rate: number | null;
		fx_dated: string | null;
	};
	toMinor: (major: number) => number;
};

const fixturePath = path.resolve(path.dirname(DEFAULT_FIXTURE), 'etl-sample.json');

describe('ETL map + FX dry-run (fixture, no network/DB)', () => {
	it('normalizeTransactionTitle drops empty and legacy placeholder', () => {
		expect(normalizeTransactionTitle(null)).toBeNull();
		expect(normalizeTransactionTitle('  ')).toBeNull();
		expect(normalizeTransactionTitle('İşlem')).toBeNull();
		expect(normalizeTransactionTitle(' Operasyon peşinat ')).toBe('Operasyon peşinat');
	});

	it('parseArgs defaults fx-backfill on; --no-fx-backfill disables', () => {
		expect(parseArgs([]).fxBackfill).toBe(true);
		expect(parseArgs(['--no-fx-backfill']).fxBackfill).toBe(false);
		expect(parseArgs(['--fx-backfill']).fxBackfill).toBe(true);
	});

	it('maps case_id→case_contact_id and contact_id separately; title İşlem→null', async () => {
		const source = loadFixtureFile(fixturePath) as {
			transactions: Array<{ id: number | string }>;
		};
		const mapped = attachContactLegacy(mapFixture(source, 'tenant-dry'), source);

		const placeholder = mapped.transactions.find((t) => t.legacy_id === '905');
		expect(placeholder).toBeTruthy();
		expect(placeholder!.verimaya.title).toBeNull();
		expect(placeholder!._case_legacy).toBe('501');
		expect(placeholder!._contact_legacy).toBe('102');
		expect(placeholder!.verimaya.case_contact_id).toBeTruthy();
		expect(placeholder!.verimaya.contact_id).toBeTruthy();
		expect(placeholder!.verimaya.case_contact_id).not.toBe(placeholder!.verimaya.contact_id);

		const withStaff = mapped.transactions.find((t) => t.legacy_id === '902');
		expect(withStaff!._responsible_legacy).toBe('105');
		expect(withStaff!.verimaya.responsible_contact_id).toBeTruthy();
		expect(withStaff!._contact_legacy).toBe('103');
		expect(withStaff!.verimaya.contact_id).toBeTruthy();
		expect(withStaff!.verimaya.case_contact_id).toBeTruthy();
		expect(withStaff!.verimaya.contact_id).not.toBe(withStaff!.verimaya.case_contact_id);

		const emptyTitle = mapped.transactions.find((t) => t.legacy_id === '906');
		expect(emptyTitle!.verimaya.title).toBeNull();
		expect(emptyTitle!._case_legacy).toBeNull();
	});

	it('Tracker counterparty wins; ECB mock fills remaining foreign rows', async () => {
		const source = loadFixtureFile(fixturePath);
		const mapped = attachContactLegacy(mapFixture(source, 'tenant-dry'), source);

		const gbp = mapped.transactions.find((t) => t.legacy_id === '901')!;
		const trackerFx = resolveFxSnapshot({
			currency: gbp.verimaya.currency,
			amountMajor: gbp._amount_major ?? NaN,
			occurredOn: gbp.verimaya.occurred_on,
			counterpartyMajor: gbp._counterparty_major,
			equivalentCurrency: gbp._equivalent_currency,
			tenantBase: 'TRY'
		});
		expect(trackerFx.amount_base).toBe(toMinor(52500));
		expect(trackerFx.fx_rate).toBeCloseTo(52500 / 1500);

		/** @type {string[]} */
		const fetchLog: string[] = [];
		const report = await enrichMappedFx(mapped.transactions, {
			tenantBase: 'TRY',
			fxBackfill: true,
			getRate: async (on, from, to) => {
				fetchLog.push(`${on}|${from}|${to}`);
				if (from === 'EUR' && to === 'TRY') {
					return { rate: 35.5, rateDate: on };
				}
				if (from === 'USD' && to === 'TRY') {
					return { rate: 32.0, rateDate: on };
				}
				return null;
			}
		});

		expect(report.tracker_snapshot).toBeGreaterThanOrEqual(1);
		expect(report.ecb_filled).toBeGreaterThanOrEqual(2);
		expect(report.missing_rate).toEqual([]);

		expect(gbp.verimaya.amount_base).toBe(toMinor(52500));
		expect(fetchLog.some((k) => k.includes('GBP'))).toBe(false);

		const eur = mapped.transactions.find((t) => t.legacy_id === '902')!;
		expect(eur.verimaya.amount_base).toBe(Math.round(12000 * 35.5));
		expect(eur.verimaya.fx_rate).toBe(35.5);
		expect(eur.verimaya.base_currency).toBe('TRY');

		const usd = mapped.transactions.find((t) => t.legacy_id === '906')!;
		expect(usd.verimaya.amount_base).toBe(Math.round(20000 * 32));
	});

	it('reports kur bulunamadı when provider returns null', async () => {
		const source = loadFixtureFile(fixturePath);
		const mapped = attachContactLegacy(mapFixture(source, 'tenant-dry'), source);
		const eurOnly = mapped.transactions.filter((t) => t.legacy_id === '902');
		const report = await enrichMappedFx(eurOnly, {
			tenantBase: 'TRY',
			fxBackfill: true,
			getRate: async () => null
		});
		expect(report.ecb_filled).toBe(0);
		expect(report.missing_rate.some((m) => m.includes('kur bulunamadı'))).toBe(true);
		expect(eurOnly[0]!.verimaya.amount_base).toBeNull();
	});

	it('--no-fx-backfill leaves foreign amount_base null when Tracker has no snapshot', async () => {
		const source = loadFixtureFile(fixturePath);
		const mapped = attachContactLegacy(mapFixture(source, 'tenant-dry'), source);
		let calls = 0;
		await enrichMappedFx(mapped.transactions, {
			tenantBase: 'TRY',
			fxBackfill: false,
			getRate: async () => {
				calls++;
				return { rate: 99, rateDate: '2026-01-01' };
			}
		});
		expect(calls).toBe(0);
		const eur = mapped.transactions.find((t) => t.legacy_id === '902')!;
		expect(eur.verimaya.amount_base).toBeNull();
		const gbp = mapped.transactions.find((t) => t.legacy_id === '901')!;
		expect(gbp.verimaya.amount_base).toBe(toMinor(52500));
	});
});
