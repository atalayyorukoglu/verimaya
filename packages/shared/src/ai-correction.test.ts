import { describe, expect, it } from 'vitest';
import {
	aggregateAiCorrectionsReport,
	aiCorrectionsReportParamsSchema,
	differingDraftFields,
	type AiCorrection,
	type TransactionDraft
} from './index.js';

const baseDraft: TransactionDraft = {
	kind: 'income',
	amount: 290000,
	currency: 'GBP',
	title: '2. vizit ödemesi',
	category: null,
	subcategory: null,
	contact_id: null,
	contact_display_name: null,
	contact_label: null,
	occurred_on: '2026-01-15',
	payment_method: null,
	description: null
};

function correction(
	partial: Partial<AiCorrection> & Pick<AiCorrection, 'original_parsed' | 'corrected'>
): AiCorrection {
	return {
		id: partial.id ?? '11111111-1111-4111-8111-111111111111',
		tenant_id: partial.tenant_id ?? '22222222-2222-4222-8222-222222222222',
		inbound_message_id: partial.inbound_message_id ?? null,
		original_parsed: partial.original_parsed,
		corrected: partial.corrected,
		created_by: partial.created_by ?? null,
		created_at: partial.created_at ?? '2026-03-01T12:00:00.000Z'
	};
}

describe('aiCorrectionsReportParamsSchema', () => {
	it('accepts empty and from/to', () => {
		expect(aiCorrectionsReportParamsSchema.parse({})).toEqual({});
		expect(aiCorrectionsReportParamsSchema.parse({ from: '2026-01-01', to: '2026-01-31' })).toEqual(
			{
				from: '2026-01-01',
				to: '2026-01-31'
			}
		);
	});

	it('rejects unknown query keys (.strict)', () => {
		expect(() => aiCorrectionsReportParamsSchema.parse({ not_a_real_filter: '1' })).toThrow();
	});
});

describe('differingDraftFields / aggregateAiCorrectionsReport', () => {
	it('lists every mismatched draft field', () => {
		expect(
			differingDraftFields(baseDraft, {
				...baseDraft,
				amount: 300000,
				category: 'Vizit'
			})
		).toEqual(['amount', 'category']);
	});

	it('aggregates correction_count and distinct_messages across fields', () => {
		const msgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
		const msgB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
		const items = [
			correction({
				id: 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1',
				inbound_message_id: msgA,
				original_parsed: [baseDraft],
				corrected: [{ ...baseDraft, amount: 300000, category: 'Vizit' }]
			}),
			correction({
				id: 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2',
				inbound_message_id: msgA,
				original_parsed: [baseDraft],
				corrected: [{ ...baseDraft, category: 'Transfer' }]
			}),
			correction({
				id: 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3',
				inbound_message_id: msgB,
				original_parsed: [baseDraft],
				corrected: [{ ...baseDraft, category: 'Vizit' }]
			})
		];

		expect(aggregateAiCorrectionsReport(items)).toEqual([
			{ field: 'category', correction_count: 3, distinct_messages: 2, by_confidence: [] },
			{ field: 'amount', correction_count: 1, distinct_messages: 1, by_confidence: [] }
		]);
	});

	it('uses correction id as message proxy when inbound_message_id is null', () => {
		const items = [
			correction({
				id: 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1',
				inbound_message_id: null,
				original_parsed: [baseDraft],
				corrected: [{ ...baseDraft, kind: 'expense' }]
			}),
			correction({
				id: 'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2',
				inbound_message_id: null,
				original_parsed: [baseDraft],
				corrected: [{ ...baseDraft, kind: 'expense' }]
			})
		];
		expect(aggregateAiCorrectionsReport(items)).toEqual([
			{ field: 'kind', correction_count: 2, distinct_messages: 2, by_confidence: [] }
		]);
	});
});
