import { describe, expect, it } from 'vitest';
import {
	reportBalanceRowSchema,
	reportBalancesSchema,
	reportPatientDistributionSchema,
	reportSummarySchema
} from './reports.js';

describe('reportSummarySchema', () => {
	it('accepts pending_base', () => {
		const parsed = reportSummarySchema.parse({
			period: { from: '2026-01-01', to: '2026-01-31' },
			income_base: 10000,
			expense_base: 3000,
			net_base: 7000,
			pending_base: 2500,
			transaction_count: 2
		});
		expect(parsed.pending_base).toBe(2500);
	});
});

describe('reportPatientDistributionSchema', () => {
	it('accepts status and source breakdown', () => {
		const parsed = reportPatientDistributionSchema.parse({
			period: { from: null, to: null },
			by_status: [{ status: 'lead', count: 3 }],
			by_source: [{ source: 'Meta', count: 2 }],
			total: 3
		});
		expect(parsed.total).toBe(3);
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
