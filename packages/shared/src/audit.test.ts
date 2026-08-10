import { describe, expect, it } from 'vitest';
import { auditLogListQuerySchema } from './audit.js';

describe('auditLogListQuerySchema (GAP-F09-13)', () => {
	it('accepts filter set alongside cursor pagination', () => {
		const parsed = auditLogListQuerySchema.parse({
			limit: 10,
			actor_id: '00000000-0000-4000-8000-000000000001',
			action: 'update',
			entity_type: 'contact',
			created_from: '2026-08-01',
			created_to: '2026-08-31',
			q: 'Contact A'
		});
		expect(parsed).toMatchObject({
			limit: 10,
			action: 'update',
			entity_type: 'contact',
			created_from: '2026-08-01',
			created_to: '2026-08-31',
			q: 'Contact A'
		});
	});

	it('rejects unknown query keys (.strict)', () => {
		const result = auditLogListQuerySchema.safeParse({
			limit: 10,
			entity_id: '00000000-0000-4000-8000-000000000099'
		});
		expect(result.success).toBe(false);
	});

	it('rejects invalid action enum', () => {
		const result = auditLogListQuerySchema.safeParse({
			limit: 10,
			action: 'hack'
		});
		expect(result.success).toBe(false);
	});

	it('rejects invalid entity_type enum', () => {
		const result = auditLogListQuerySchema.safeParse({
			limit: 10,
			entity_type: 'invoice'
		});
		expect(result.success).toBe(false);
	});
});
