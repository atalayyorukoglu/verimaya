import { describe, expect, it } from 'vitest';
import {
	reportAppointmentMetricsSchema,
	reportBalanceRowSchema,
	reportBalancesSchema,
	reportPatientDistributionSchema,
	reportSummarySchema
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

describe('reportPatientDistributionSchema', () => {
	it('accepts status and source breakdown', () => {
		const parsed = reportPatientDistributionSchema.parse({
			period: { from: null, to: null },
			by_status: [{ status: 'scheduled', count: 3 }],
			by_source: [{ source: 'Meta', count: 2 }],
			total: 3
		});
		expect(parsed.total).toBe(3);
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
