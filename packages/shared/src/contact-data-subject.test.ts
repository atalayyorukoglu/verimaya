import { describe, expect, it } from 'vitest';
import {
	contactDataDeletionRequestSchema,
	contactDataExportSchema
} from './contact-data-subject.js';

const contactId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const typeId = '44444444-4444-4444-8444-444444444444';

describe('contact-data-subject schemas (AUDIT-F09-07b)', () => {
	it('parses a contact deletion-request with applied anonymization', () => {
		const parsed = contactDataDeletionRequestSchema.parse({
			id: requestId,
			tenant_id: tenantId,
			subject_contact_id: contactId,
			status: 'applied',
			anonymized_at: '2026-08-11T12:00:00.000Z',
			created_at: '2026-08-11T12:00:00.000Z'
		});
		expect(parsed.status).toBe('applied');
		expect(parsed.subject_contact_id).toBe(contactId);
	});

	it('parses a machine-readable contact data export', () => {
		const parsed = contactDataExportSchema.parse({
			exported_at: '2026-08-11T12:00:00.000Z',
			tenant_id: tenantId,
			data_retention_until: null,
			contact: {
				id: contactId,
				tenant_id: tenantId,
				contact_type_id: typeId,
				contact_type_name: 'Hasta',
				first_name: 'Ada',
				last_name: 'Yılmaz',
				display_name: 'Ada Yılmaz',
				phone: '+905551112233',
				email: 'ada@example.com',
				notes: null,
				organization_id: null,
				status: null,
				assigned_user_id: null,
				source: null,
				medium: null,
				campaign: null,
				referred_by_contact_id: null,
				is_internal: false,
				usage_count: 0,
				created_at: '2026-01-01T00:00:00.000Z',
				updated_at: '2026-01-01T00:00:00.000Z'
			},
			case_notes: [],
			appointments: [],
			files: [],
			finance_summary: {
				income_base: 0,
				expense_base: 0,
				net_base: 0,
				paid_base: 0,
				outstanding_base: 0,
				transaction_count: 0
			},
			deletion_requests: []
		});
		expect(parsed.contact.id).toBe(contactId);
		expect(parsed.finance_summary.transaction_count).toBe(0);
	});
});
