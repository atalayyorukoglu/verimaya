import { describe, expect, it } from 'vitest';
import { contactsBulkTypeSchema, contactTypeUpdateSchema } from './contact.js';

const typeId = '11111111-1111-4111-8111-111111111111';
const contactId = '22222222-2222-4222-8222-222222222222';

describe('contactTypeUpdateSchema (GAP-F09-17)', () => {
	it('accepts { name } and rejects unknown keys', () => {
		expect(contactTypeUpdateSchema.safeParse({ name: 'Klinik' }).success).toBe(true);
		expect(contactTypeUpdateSchema.safeParse({ name: 'Klinik', extra: true }).success).toBe(
			false
		);
		expect(contactTypeUpdateSchema.safeParse({}).success).toBe(false);
	});
});

describe('contactsBulkTypeSchema (GAP-F09-17)', () => {
	it('requires non-empty contact_ids and a UUID contact_type_id (null unsupported)', () => {
		expect(
			contactsBulkTypeSchema.safeParse({
				contact_ids: [contactId],
				contact_type_id: typeId
			}).success
		).toBe(true);

		expect(
			contactsBulkTypeSchema.safeParse({
				contact_ids: [],
				contact_type_id: typeId
			}).success
		).toBe(false);

		expect(
			contactsBulkTypeSchema.safeParse({
				contact_ids: [contactId],
				contact_type_id: null
			}).success
		).toBe(false);

		expect(
			contactsBulkTypeSchema.safeParse({
				contact_ids: [contactId],
				contact_type_id: typeId,
				extra: 1
			}).success
		).toBe(false);
	});
});
