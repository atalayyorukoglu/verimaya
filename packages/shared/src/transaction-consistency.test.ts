import { describe, expect, it } from 'vitest';
import {
	evaluateTransactionConsistency,
	transactionAuditDraftSchema,
	transactionConsistencyCodeMeta,
} from './transaction-consistency.js';

describe('evaluateTransactionConsistency', () => {
	const base = { baseCurrency: 'TRY' };

	it('flags category_missing when category blank', () => {
		const issues = evaluateTransactionConsistency(
			{
				kind: 'income',
				category: '  ',
				contact_id: 'x',
				currency: 'TRY',
				amount: 100,
			},
			base,
		);
		expect(issues.map((i) => i.code)).toContain('category_missing');
	});

	it('flags income without contact', () => {
		const issues = evaluateTransactionConsistency(
			{
				kind: 'income',
				category: 'Op',
				contact_id: null,
				currency: 'TRY',
				amount: 100,
			},
			base,
		);
		expect(issues.map((i) => i.code)).toContain('income_contact_missing');
	});

	it('flags expense without contact or label', () => {
		const issues = evaluateTransactionConsistency(
			{
				kind: 'expense',
				category: 'Op',
				contact_id: null,
				contact_label: '',
				currency: 'TRY',
				amount: 100,
			},
			base,
		);
		expect(issues.map((i) => i.code)).toContain('expense_contact_missing');
	});

	it('allows expense with free-text label only', () => {
		const issues = evaluateTransactionConsistency(
			{
				kind: 'expense',
				category: 'Op',
				contact_id: null,
				contact_label: 'Vendor',
				currency: 'TRY',
				amount: 100,
				status: 'paid',
				paid_amount: 100,
				amount_base: 100,
			},
			base,
		);
		expect(issues.map((i) => i.code)).not.toContain('expense_contact_missing');
	});

	it('flags fx_missing for foreign currency without amount_base', () => {
		const issues = evaluateTransactionConsistency(
			{
				kind: 'income',
				category: 'Op',
				contact_id: 'c',
				currency: 'EUR',
				amount: 100,
				amount_base: null,
			},
			base,
		);
		expect(issues.map((i) => i.code)).toContain('fx_missing');
	});

	it('does not flag fx when currency equals base even if amount_base null', () => {
		const issues = evaluateTransactionConsistency(
			{
				kind: 'income',
				category: 'Op',
				contact_id: 'c',
				currency: 'TRY',
				amount: 100,
				amount_base: null,
			},
			base,
		);
		expect(issues.map((i) => i.code)).not.toContain('fx_missing');
	});

	it('flags paid / unpaid / partial amount errors', () => {
		expect(
			evaluateTransactionConsistency(
				{
					kind: 'income',
					category: 'Op',
					contact_id: 'c',
					currency: 'TRY',
					amount: 1000,
					status: 'paid',
					paid_amount: 500,
					amount_base: 1000,
				},
				base,
			).map((i) => i.code),
		).toContain('paid_amount_mismatch');

		expect(
			evaluateTransactionConsistency(
				{
					kind: 'income',
					category: 'Op',
					contact_id: 'c',
					currency: 'TRY',
					amount: 1000,
					status: 'unpaid',
					paid_amount: 1,
					amount_base: 1000,
				},
				base,
			).map((i) => i.code),
		).toContain('unpaid_with_payment');

		expect(
			evaluateTransactionConsistency(
				{
					kind: 'income',
					category: 'Op',
					contact_id: 'c',
					currency: 'TRY',
					amount: 1000,
					status: 'partial',
					paid_amount: 1000,
					amount_base: 1000,
				},
				base,
			).map((i) => i.code),
		).toContain('partial_amount_invalid');
	});

	it('flags contact_equals_responsible without category-based case rules', () => {
		const id = '550e8400-e29b-41d4-a716-446655440000';
		const issues = evaluateTransactionConsistency(
			{
				kind: 'expense',
				category: 'Op',
				contact_id: id,
				responsible_contact_id: id,
				currency: 'TRY',
				amount: 100,
				status: 'paid',
				paid_amount: 100,
				amount_base: 100,
				case_contact_id: null,
			},
			base,
		);
		expect(issues.map((i) => i.code)).toEqual(['contact_equals_responsible']);
		expect(issues[0]?.severity).toBe('error');
	});

	it('does not require case_contact_id for any category', () => {
		const issues = evaluateTransactionConsistency(
			{
				kind: 'income',
				category: 'Ticari Gelirler',
				contact_id: 'c',
				case_contact_id: null,
				currency: 'TRY',
				amount: 100,
				status: 'paid',
				paid_amount: 100,
				amount_base: 100,
			},
			base,
		);
		expect(issues).toEqual([]);
	});

	it('flags responsible_not_internal only when enrichment is false', () => {
		const withUnknown = evaluateTransactionConsistency(
			{
				kind: 'expense',
				category: 'Op',
				contact_id: 'c',
				responsible_contact_id: 'r',
				currency: 'TRY',
				amount: 100,
				status: 'paid',
				paid_amount: 100,
				amount_base: 100,
			},
			base,
		);
		expect(withUnknown.map((i) => i.code)).not.toContain(
			'responsible_not_internal',
		);

		const withFalse = evaluateTransactionConsistency(
			{
				kind: 'expense',
				category: 'Op',
				contact_id: 'c',
				responsible_contact_id: 'r',
				responsible_is_internal: false,
				currency: 'TRY',
				amount: 100,
				status: 'paid',
				paid_amount: 100,
				amount_base: 100,
			},
			base,
		);
		expect(withFalse.map((i) => i.code)).toContain('responsible_not_internal');
	});

	it('meta message keys stay under reports.consistency.*', () => {
		for (const meta of Object.values(transactionConsistencyCodeMeta)) {
			expect(meta.message_key.startsWith('reports.consistency.')).toBe(true);
		}
	});

	it('parses sparse audit-draft body', () => {
		expect(transactionAuditDraftSchema.parse({ kind: 'income' })).toEqual({
			kind: 'income',
		});
		expect(
			transactionAuditDraftSchema.safeParse({ unknown: true }).success,
		).toBe(false);
	});
});
