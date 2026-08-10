import { describe, expect, it } from 'vitest';
import {
	contactCreateSchema,
	contactSchema,
	contactsBulkTypeSchema,
	contactTypeUpdateSchema,
	organizationUpdateSchema
} from './contact.js';

const typeId = '11111111-1111-4111-8111-111111111111';
const contactId = '22222222-2222-4222-8222-222222222222';
const tenantId = '33333333-3333-4333-8333-333333333333';

describe('contactTypeUpdateSchema (GAP-F09-17)', () => {
	it('accepts { name } and rejects unknown keys', () => {
		expect(contactTypeUpdateSchema.safeParse({ name: 'Klinik' }).success).toBe(true);
		expect(contactTypeUpdateSchema.safeParse({ name: 'Klinik', extra: true }).success).toBe(
			false
		);
		expect(contactTypeUpdateSchema.safeParse({}).success).toBe(false);
	});
});

describe('organizationUpdateSchema (§0-A)', () => {
	it('accepts { name } and rejects unknown keys', () => {
		expect(organizationUpdateSchema.safeParse({ name: 'Acme Klinik' }).success).toBe(true);
		expect(organizationUpdateSchema.safeParse({ name: 'Acme', extra: true }).success).toBe(
			false
		);
		expect(organizationUpdateSchema.safeParse({}).success).toBe(false);
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

describe('contactCreateSchema (DOMAIN-02 Faz A)', () => {
	it('requires first_name and does not declare display_name', () => {
		expect(
			contactCreateSchema.safeParse({
				contact_type_id: typeId,
				first_name: 'Ayşe',
				last_name: 'Yılmaz'
			}).success
		).toBe(true);

		expect(
			contactCreateSchema.safeParse({
				contact_type_id: typeId,
				display_name: 'Ayşe Yılmaz'
			}).success
		).toBe(false);

		const withDisplay = contactCreateSchema.safeParse({
			contact_type_id: typeId,
			first_name: 'Ayşe',
			display_name: 'ignored'
		});
		expect(withDisplay.success).toBe(true);
		if (withDisplay.success) {
			expect('display_name' in withDisplay.data).toBe(false);
		}
	});

	it('accepts campaign max 128 and organization / attribution fields', () => {
		expect(
			contactCreateSchema.safeParse({
				contact_type_id: typeId,
				first_name: 'Ali',
				organization_id: contactId,
				source: 'Dijital Reklam',
				medium: 'Meta Ads',
				campaign: 'Implant_Yaz_Kampanyasi_2026',
				referred_by_contact_id: contactId
			}).success
		).toBe(true);

		expect(
			contactCreateSchema.safeParse({
				contact_type_id: typeId,
				first_name: 'Ali',
				campaign: 'x'.repeat(129)
			}).success
		).toBe(false);
	});
});

describe('contactSchema (DOMAIN-02 Faz A)', () => {
	it('requires first_name + display_name on read model', () => {
		const parsed = contactSchema.parse({
			id: contactId,
			tenant_id: tenantId,
			contact_type_id: typeId,
			contact_type_name: 'Hasta',
			first_name: 'Ayşe',
			last_name: 'Yılmaz',
			display_name: 'Ayşe Yılmaz',
			phone: null,
			email: null,
			notes: null,
			organization_id: null,
			status: 'scheduled',
			assigned_user_id: null,
			source: 'Organik',
			medium: null,
			campaign: null,
			referred_by_contact_id: null,
			is_internal: false,
			usage_count: 0,
			created_at: '2026-08-10T00:00:00.000Z',
			updated_at: '2026-08-10T00:00:00.000Z'
		});
		expect(parsed.display_name).toBe('Ayşe Yılmaz');
		expect(parsed.status).toBe('scheduled');
	});
});
