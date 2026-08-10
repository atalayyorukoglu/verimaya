import { describe, expect, it } from 'vitest';
import {
	REPORT_TRANSACTION_DUPLICATES_ITEMS_LIMIT,
	reportAppointmentMetricsSchema,
	reportBalanceRowSchema,
	reportBalancesSchema,
	reportConsistencySchema,
	reportContactDistributionSchema,
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
			monthly: [{ month: '2026-01', count: 4 }]
		});
		expect(parsed.completion_rate).toBe(0.5);
		expect(parsed.by_clinic[0]?.clinic_name).toBe('Atanmamış');
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
					transaction_count: 2
				}
			]
		});
		expect(parsed.items[0]?.open_amount).toBe(5000);
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
