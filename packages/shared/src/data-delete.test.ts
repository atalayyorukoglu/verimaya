import { describe, expect, it } from 'vitest';
import {
	dataDeleteExecuteBodySchema,
	dataDeletePreviewBodySchema,
	expandDataDeleteTables
} from './data-delete.js';

describe('data-delete (G-25)', () => {
	it('rejects empty and duplicate scopes', () => {
		expect(dataDeletePreviewBodySchema.safeParse({ scopes: [] }).success).toBe(false);
		expect(
			dataDeletePreviewBodySchema.safeParse({
				scopes: ['transactions', 'transactions']
			}).success
		).toBe(false);
	});

	it('accepts a unique non-empty scope set', () => {
		const parsed = dataDeletePreviewBodySchema.parse({
			scopes: ['transactions', 'files']
		});
		expect(parsed.scopes).toEqual(['transactions', 'files']);
	});

	it('expandDataDeleteTables pulls contact dependents', () => {
		expect(expandDataDeleteTables(['transactions'])).toEqual([
			'transactions',
			'external_ids'
		]);
		expect(expandDataDeleteTables(['files'])).toEqual(['files', 'external_ids']);
		expect(expandDataDeleteTables(['contacts'])).toEqual([
			'files',
			'appointments',
			'case_notes',
			'contact_data_deletion_requests',
			'contacts',
			'external_ids'
		]);
	});

	it('execute body requires plan_token and confirm name', () => {
		expect(
			dataDeleteExecuteBodySchema.safeParse({
				plan_token: 'x',
				confirm_organization_name: 'Acme'
			}).success
		).toBe(true);
		expect(
			dataDeleteExecuteBodySchema.safeParse({
				plan_token: 'x'
			}).success
		).toBe(false);
	});
});
