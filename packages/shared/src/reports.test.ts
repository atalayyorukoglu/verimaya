import { describe, expect, it } from 'vitest';
import {
	REPORT_TRANSACTION_DUPLICATES_ITEMS_LIMIT,
	cohortMonthDiff,
	maturationBucket,
	previousReportPeriod,
	reportAppointmentMetricsSchema,
	reportBalanceRowSchema,
	reportBalancesSchema,
	reportCohortsSchema,
	reportConsistencySchema,
	reportContactDistributionSchema,
	reportPeriodCompareParams,
	reportSummarySchema,
	reportTransactionDuplicatesParams,
	reportTransactionDuplicatesSchema
} from './reports.js';

describe('reportSummarySchema', () => {
	it('accepts pending_base and FX coverage fields', () => {
		const parsed = reportSummarySchema.parse({
			period: { from: '2026-01-01', to: '2026-01-31' },
			income_base: 10000,
			expense_base: 3000,
			net_base: 7000,
			pending_base: 2500,
			transaction_count: 2,
			fx_missing_count: 1,
			fx_missing_amount_by_currency: [{ currency: 'TRY', amount_minor: 5000 }],
			coverage_ratio: 0.5
		});
		expect(parsed.pending_base).toBe(2500);
		expect(parsed.fx_missing_count).toBe(1);
		expect(parsed.coverage_ratio).toBe(0.5);
	});
});

describe('reportSummarySchema — previous (dönem karşılaştırması)', () => {
	const base = {
		period: { from: '2026-08-01', to: '2026-08-31' },
		income_base: 10000,
		expense_base: 3000,
		net_base: 7000,
		pending_base: 2500,
		transaction_count: 2,
		fx_missing_count: 0,
		fx_missing_amount_by_currency: [],
		coverage_ratio: 1
	};

	it('parses without `previous` — bugünkü şekliyle aynı (regresyon)', () => {
		const parsed = reportSummarySchema.parse(base);
		expect(parsed.previous).toBeUndefined();
		expect('previous' in parsed).toBe(false);
	});

	it('accepts `previous` in the same shape', () => {
		const parsed = reportSummarySchema.parse({
			...base,
			previous: { ...base, period: { from: '2026-07-01', to: '2026-07-31' } }
		});
		expect(parsed.previous?.income_base).toBe(10000);
		expect(parsed.previous?.period.from).toBe('2026-07-01');
	});
});

describe('previousReportPeriod', () => {
	it('31 günlük Ağustos → 31 günlük Temmuz', () => {
		expect(previousReportPeriod('2026-08-01', '2026-08-31')).toEqual({
			from: '2026-07-01',
			to: '2026-07-31'
		});
	});

	it('11 günlük pencere → aynı uzunlukta önceki pencere', () => {
		expect(previousReportPeriod('2026-08-10', '2026-08-20')).toEqual({
			from: '2026-07-30',
			to: '2026-08-09'
		});
	});

	it('from veya to eksikse null (sınırsız dönemin öncesi tanımsız)', () => {
		expect(previousReportPeriod(undefined, '2026-08-31')).toBeNull();
		expect(previousReportPeriod('2026-08-01', undefined)).toBeNull();
		expect(previousReportPeriod(undefined, undefined)).toBeNull();
	});

	it('tek günlük pencere → tek günlük önceki gün', () => {
		expect(previousReportPeriod('2026-08-10', '2026-08-10')).toEqual({
			from: '2026-08-09',
			to: '2026-08-09'
		});
	});
});

describe('reportPeriodCompareParams', () => {
	it('compare opsiyonel — yoksa undefined', () => {
		const parsed = reportPeriodCompareParams.parse({ from: '2026-08-01', to: '2026-08-31' });
		expect(parsed.compare).toBeUndefined();
	});

	it('compare=previous kabul edilir', () => {
		const parsed = reportPeriodCompareParams.parse({
			from: '2026-08-01',
			to: '2026-08-31',
			compare: 'previous'
		});
		expect(parsed.compare).toBe('previous');
	});

	it('geçersiz compare değeri reddedilir', () => {
		expect(() =>
			reportPeriodCompareParams.parse({ from: '2026-08-01', to: '2026-08-31', compare: 'yes' })
		).toThrow();
	});
});

describe('reportContactDistributionSchema', () => {
	it('accepts status, source, and medium breakdown', () => {
		const parsed = reportContactDistributionSchema.parse({
			period: { from: null, to: null },
			by_status: [{ status: 'scheduled', count: 3 }],
			by_source: [{ source: 'Dijital Reklam', count: 2 }],
			by_medium: [{ medium: 'Meta Ads', count: 2 }],
			total: 3
		});
		expect(parsed.total).toBe(3);
		expect(parsed.by_medium[0]?.medium).toBe('Meta Ads');
	});
});

describe('reportAppointmentMetricsSchema (GAP-07)', () => {
	it('accepts rates as 0–1 fractions plus clinic/type/monthly breakdowns', () => {
		const parsed = reportAppointmentMetricsSchema.parse({
			period: { from: '2026-01-01', to: '2026-03-31' },
			total: 4,
			completion_rate: 0.5,
			no_show_rate: 0.25,
			cancellation_rate: 0.25,
			by_clinic: [
				{
					clinic_contact_id: null,
					clinic_name: 'Atanmamış',
					count: 2,
					completion_rate: 0.5
				}
			],
			by_appointment_type: [{ appointment_type: 'Belirtilmemiş', count: 4, ratio: 1 }],
			by_doctor: [
				{
					doctor_contact_id: null,
					doctor_name: 'Atanmamış',
					total: 2,
					completed: 1,
					no_show: 1,
					cancelled: 0
				}
			],
			by_doctor_type: [
				{
					doctor_contact_id: null,
					doctor_name: 'Atanmamış',
					appointment_type: 'RPT',
					count: 1
				}
			],
			monthly: [{ month: '2026-01', count: 4 }]
		});
		expect(parsed.completion_rate).toBe(0.5);
		expect(parsed.by_clinic[0]?.clinic_name).toBe('Atanmamış');
		expect(parsed.by_doctor[0]?.doctor_name).toBe('Atanmamış');
		expect(parsed.by_doctor_type[0]?.appointment_type).toBe('RPT');
	});
});

describe('reportConsistencySchema (GAP-05)', () => {
	it('accepts items with message_key, severity counts, and truncated', () => {
		const parsed = reportConsistencySchema.parse({
			period: { from: '2026-01-01', to: '2026-01-31' },
			items: [
				{
					transaction_id: '550e8400-e29b-41d4-a716-446655440000',
					title: 'Missing cat',
					occurred_on: '2026-01-15',
					severity: 'warning',
					code: 'category_missing',
					message_key: 'reports.consistency.category_missing'
				}
			],
			counts: { error: 0, warning: 1 },
			counts_by_code: { category_missing: 1 },
			truncated: false
		});
		expect(parsed.counts.warning).toBe(1);
		expect(parsed.counts_by_code.category_missing).toBe(1);
		expect(parsed.truncated).toBe(false);
		expect(parsed.items[0]?.message_key).toBe('reports.consistency.category_missing');
	});
});

describe('reportTransactionDuplicatesSchema (GAP-F09-14)', () => {
	it('accepts groups with total_groups and capped items', () => {
		const parsed = reportTransactionDuplicatesSchema.parse({
			items: [
				{
					count: 3,
					amount: 10000,
					currency: 'TRY',
					occurred_on: '2026-05-01',
					kind: 'income',
					title: 'Dup sample'
				}
			],
			total_groups: 1
		});
		expect(parsed.items[0]?.count).toBe(3);
		expect(parsed.total_groups).toBe(1);
		expect(REPORT_TRANSACTION_DUPLICATES_ITEMS_LIMIT).toBe(20);
	});

	it('rejects unknown query keys (.strict)', () => {
		expect(() =>
			reportTransactionDuplicatesParams.parse({ from: '2026-05-01', limit: '100' })
		).toThrow();
	});
});

describe('reportBalancesSchema', () => {
	it('accepts signed open and collected amounts', () => {
		const parsed = reportBalancesSchema.parse({
			items: [
				{
					contact_id: '550e8400-e29b-41d4-a716-446655440000',
					contact_label: 'Klinik A',
					currency: 'TRY',
					open_amount: 5000,
					collected_amount: 10000,
					transaction_count: 2,
					aging: { d0_30: 2000, d31_60: 0, d61_90: 0, d90_plus: 3000 },
					oldest_open_days: 118
				}
			]
		});
		expect(parsed.items[0]?.open_amount).toBe(5000);
	});

	it('yaşlandırma kovalarının toplamı open_amount ile tutarlı olmalı (sözleşme yorumu)', () => {
		const row = reportBalanceRowSchema.parse({
			contact_id: '550e8400-e29b-41d4-a716-446655440000',
			contact_label: 'Klinik A',
			currency: 'TRY',
			open_amount: 5000,
			collected_amount: 0,
			transaction_count: 2,
			aging: { d0_30: 2000, d31_60: 0, d61_90: 0, d90_plus: 3000 },
			oldest_open_days: 118
		});
		const sum = row.aging.d0_30 + row.aging.d31_60 + row.aging.d61_90 + row.aging.d90_plus;
		expect(sum).toBe(row.open_amount);
	});

	it('açık tutarı olmayan satırda oldest_open_days null olabilir', () => {
		const row = reportBalanceRowSchema.parse({
			contact_id: '550e8400-e29b-41d4-a716-446655440000',
			contact_label: 'Klinik A',
			currency: 'TRY',
			open_amount: 0,
			collected_amount: 10000,
			transaction_count: 1,
			aging: { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 },
			oldest_open_days: null
		});
		expect(row.oldest_open_days).toBeNull();
	});

	it('rejects invalid balance row', () => {
		expect(() =>
			reportBalanceRowSchema.parse({
				contact_id: 'not-a-uuid',
				contact_label: 'X',
				currency: 'TRY',
				open_amount: 0,
				collected_amount: 0,
				transaction_count: 0
			})
		).toThrow();
	});
});

describe('cohort maturation helpers', () => {
	it('maps Jan→Apr collection to m3_plus', () => {
		expect(cohortMonthDiff('2026-01', '2026-04-15')).toBe(3);
		expect(maturationBucket(3)).toBe('m3_plus');
	});

	it('maps same-month and later offsets', () => {
		expect(maturationBucket(cohortMonthDiff('2026-01', '2026-01-20'))).toBe('m0');
		expect(maturationBucket(cohortMonthDiff('2026-01', '2026-02-01'))).toBe('m1');
		expect(maturationBucket(cohortMonthDiff('2026-01', '2026-03-01'))).toBe('m2');
	});
});

describe('reportCohortsSchema', () => {
	it('requires attribution note_key and allows null roas', () => {
		const parsed = reportCohortsSchema.parse({
			period: { from: '2025-09-01', to: '2026-08-31' },
			note_key: 'cohort_attribution_assumption',
			missing_fx_count: 0,
			items: [
				{
					cohort_month: '2026-01',
					contacts: 2,
					treated: 1,
					spend_base: 0,
					collected_base: 5000,
					roas: null,
					maturation: { m0: 0, m1: 0, m2: 0, m3_plus: 5000 }
				}
			]
		});
		expect(parsed.note_key).toBe('cohort_attribution_assumption');
		expect(parsed.items[0]?.roas).toBeNull();
	});
});
