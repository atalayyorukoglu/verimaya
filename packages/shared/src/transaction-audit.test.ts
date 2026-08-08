import { describe, expect, it } from 'vitest';
import { auditTransactionInput } from './transaction-audit.js';

describe('auditTransactionInput', () => {
	it('flags income without patient', () => {
		const issues = auditTransactionInput(
			{
				kind: 'income',
				title: 'Test',
				category: 'Genel',
				status: 'paid',
				amount: 1000,
				paid_amount: 1000,
				currency: 'TRY',
				amount_base: 1000,
				base_currency: 'TRY',
				patient_id: null,
				contact_label: null
			},
			'TRY'
		);
		expect(issues.some((i) => i.rule === 'income_patient_required')).toBe(true);
	});

	it('flags fx missing for foreign currency', () => {
		const issues = auditTransactionInput(
			{
				kind: 'expense',
				title: 'Hotel',
				category: 'Konaklama',
				status: 'paid',
				amount: 5000,
				paid_amount: 5000,
				currency: 'EUR',
				amount_base: null,
				base_currency: null,
				patient_id: null,
				contact_label: 'Otel A'
			},
			'GBP'
		);
		expect(issues.some((i) => i.rule === 'fx_missing')).toBe(true);
	});

	it('returns empty for a clean row', () => {
		const issues = auditTransactionInput(
			{
				kind: 'expense',
				title: 'Transfer',
				category: 'Ulaşım',
				status: 'paid',
				amount: 2000,
				paid_amount: 2000,
				currency: 'TRY',
				amount_base: 2000,
				base_currency: 'TRY',
				patient_id: null,
				contact_label: 'Transfer Co'
			},
			'TRY'
		);
		expect(issues).toHaveLength(0);
	});
});
