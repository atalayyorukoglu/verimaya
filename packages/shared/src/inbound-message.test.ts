import { describe, expect, it } from 'vitest';
import { approveDraftItemSchema, approveDraftsRequestSchema } from './inbound-message.js';

const baseDraft = {
	kind: 'income' as const,
	amount: 10000,
	currency: 'GBP' as const,
	title: 'Test payment',
	occurred_on: '2026-08-01',
	status: 'paid' as const,
	paid_amount: 10000,
	fx_rate: 43,
	amount_base: 430000,
	contact_label: 'Sandra'
};

describe('approveDraftItemSchema', () => {
	it('accepts a fully specified approval item', () => {
		const parsed = approveDraftItemSchema.safeParse(baseDraft);
		expect(parsed.success).toBe(true);
	});

	it('rejects missing counterparty', () => {
		const parsed = approveDraftItemSchema.safeParse({
			...baseDraft,
			contact_label: null,
			contact_id: null
		});
		expect(parsed.success).toBe(false);
	});

	it('rejects unpaid with non-zero paid_amount', () => {
		const parsed = approveDraftItemSchema.safeParse({
			...baseDraft,
			status: 'unpaid',
			paid_amount: 100
		});
		expect(parsed.success).toBe(false);
	});

	it('rejects paid when paid_amount ≠ amount', () => {
		const parsed = approveDraftItemSchema.safeParse({
			...baseDraft,
			status: 'paid',
			paid_amount: 5000
		});
		expect(parsed.success).toBe(false);
	});

	it('rejects partial outside (0, amount)', () => {
		expect(
			approveDraftItemSchema.safeParse({
				...baseDraft,
				status: 'partial',
				paid_amount: 0
			}).success
		).toBe(false);
		expect(
			approveDraftItemSchema.safeParse({
				...baseDraft,
				status: 'partial',
				paid_amount: 10000
			}).success
		).toBe(false);
		expect(
			approveDraftItemSchema.safeParse({
				...baseDraft,
				status: 'partial',
				paid_amount: 5000
			}).success
		).toBe(true);
	});

	it('rejects missing fx_rate / amount_base', () => {
		const { fx_rate: _fx, amount_base: _ab, ...rest } = baseDraft;
		expect(approveDraftItemSchema.safeParse(rest).success).toBe(false);
	});
});

describe('approveDraftsRequestSchema', () => {
	it('requires at least one draft', () => {
		expect(approveDraftsRequestSchema.safeParse({ drafts: [] }).success).toBe(false);
		expect(approveDraftsRequestSchema.safeParse({ drafts: [baseDraft] }).success).toBe(true);
	});
});
