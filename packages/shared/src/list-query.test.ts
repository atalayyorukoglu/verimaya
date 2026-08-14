import { describe, expect, it } from 'vitest';
import { appointmentListQuerySchema, transactionListQuerySchema } from './list-query.js';

describe('appointmentListQuerySchema (GAP-04)', () => {
	it('accepts status and q alongside existing filters', () => {
		const parsed = appointmentListQuerySchema.parse({
			limit: 10,
			contact_id: '00000000-0000-4000-8000-000000000001',
			from: '2026-08-01',
			to: '2026-08-31',
			status: 'confirmed',
			q: 'klinik'
		});
		expect(parsed).toMatchObject({
			limit: 10,
			status: 'confirmed',
			q: 'klinik'
		});
	});

	it('rejects unknown query keys (.strict)', () => {
		const result = appointmentListQuerySchema.safeParse({
			limit: 10,
			contact_involves: '1'
		});
		expect(result.success).toBe(false);
	});
});

describe('transactionListQuerySchema (GAP-03)', () => {
	it('accepts kind, status, category, q alongside existing filters', () => {
		const parsed = transactionListQuerySchema.parse({
			limit: 10,
			kind: 'expense',
			status: 'unpaid',
			category: 'Konaklama',
			q: 'otel',
			from: '2026-08-01',
			to: '2026-08-31'
		});
		expect(parsed).toMatchObject({
			limit: 10,
			kind: 'expense',
			status: 'unpaid',
			category: 'Konaklama',
			q: 'otel',
			from: '2026-08-01',
			to: '2026-08-31'
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
