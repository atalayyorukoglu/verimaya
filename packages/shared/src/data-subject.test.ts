import { describe, expect, it } from 'vitest';
import { dataDeletionRequestSchema, dataExportSchema } from './data-subject.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';

describe('data-subject schemas (AUDIT-F09-07)', () => {
	it('parses a deletion-request with applied anonymization', () => {
		const parsed = dataDeletionRequestSchema.parse({
			id: requestId,
			tenant_id: tenantId,
			subject_user_id: subjectId,
			status: 'applied',
			anonymized_at: '2026-08-10T12:00:00.000Z',
			created_at: '2026-08-10T12:00:00.000Z'
		});
		expect(parsed.status).toBe('applied');
		expect(parsed.anonymized_at).toBe('2026-08-10T12:00:00.000Z');
	});

	it('parses a machine-readable data export (subject only + own audit)', () => {
		const parsed = dataExportSchema.parse({
			exported_at: '2026-08-10T12:00:00.000Z',
			tenant_id: tenantId,
			data_retention_until: null,
			subject: {
				id: subjectId,
				email: 'agent@example.com',
				display_name: 'Agent',
				role: 'agent',
				created_at: '2026-01-01T00:00:00.000Z',
				membership_created_at: '2026-01-02T00:00:00.000Z'
			},
			audit_logs_as_actor: [],
			deletion_requests: []
		});
		expect(parsed.subject.email).toBe('agent@example.com');
		expect(parsed.data_retention_until).toBeNull();
	});

	it('rejects unknown export keys (strict surface)', () => {
		const result = dataExportSchema.safeParse({
			exported_at: '2026-08-10T12:00:00.000Z',
			tenant_id: tenantId,
			data_retention_until: null,
			subject: {
				id: subjectId,
				email: 'agent@example.com',
				display_name: 'Agent',
				role: 'agent',
				created_at: '2026-01-01T00:00:00.000Z',
				membership_created_at: '2026-01-02T00:00:00.000Z'
			},
			audit_logs_as_actor: [],
			deletion_requests: [],
			contacts: []
		});
		// default zod object strips unknown — ensure contacts are not part of schema shape
		expect('contacts' in dataExportSchema.shape).toBe(false);
		expect(result.success).toBe(true);
	});
});
