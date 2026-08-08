import { describe, expect, it } from 'vitest';
import { transactionListQuerySchema } from './list-query.js';

describe('transactionListQuerySchema (GAP-03)', () => {
	it('accepts kind, status, category, q alongside existing filters', () => {
		const parsed = transactionListQuerySchema.parse({
			limit: 10,
			kind: 'expense',
			status: 'unpaid',
			category: 'Konaklama',
			q: 'otel'
		});
		expect(parsed).toMatchObject({
			limit: 10,
			kind: 'expense',
			status: 'unpaid',
			category: 'Konaklama',
			q: 'otel'
		});
	});

	it('rejects unknown query keys (.strict)', () => {
		const result = transactionListQuerySchema.safeParse({
			limit: 10,
			not_a_real_filter: '1'
		});
		expect(result.success).toBe(false);
	});
});
