import { describe, expect, it } from 'vitest';
import {
	API_KEY_MACHINE_SCOPES,
	LEGACY_API_KEY_READ_SCOPES,
	LEGACY_API_KEY_WRITE_SCOPES,
	apiKeyCreateSchema,
	apiKeyHasScope,
	apiKeyScopeSchema
} from './api-key.js';

describe('AUDIT-F09-02 api key scopes', () => {
	it('rejects legacy read/write tokens', () => {
		expect(apiKeyScopeSchema.safeParse('read').success).toBe(false);
		expect(apiKeyScopeSchema.safeParse('write').success).toBe(false);
		expect(apiKeyScopeSchema.safeParse('contact:read').success).toBe(true);
	});

	it('create schema requires at least one resource:action scope', () => {
		expect(
			apiKeyCreateSchema.safeParse({ name: 'ops', scopes: ['contact:read'] }).success
		).toBe(true);
		expect(apiKeyCreateSchema.safeParse({ name: 'ops', scopes: [] }).success).toBe(false);
		expect(apiKeyCreateSchema.safeParse({ name: 'ops', scopes: ['read'] }).success).toBe(false);
	});

	it('apiKeyHasScope matches resource:action tokens', () => {
		expect(apiKeyHasScope([...LEGACY_API_KEY_READ_SCOPES], 'contact', 'read')).toBe(true);
		expect(apiKeyHasScope([...LEGACY_API_KEY_READ_SCOPES], 'contact', 'update')).toBe(false);
		expect(apiKeyHasScope([...LEGACY_API_KEY_WRITE_SCOPES], 'finance', 'delete')).toBe(true);
		expect(apiKeyHasScope([...LEGACY_API_KEY_WRITE_SCOPES], 'audit', 'read')).toBe(false);
	});

	it('legacy migration bundles stay within machine scopes (no silent admin expand)', () => {
		for (const scope of [...LEGACY_API_KEY_READ_SCOPES, ...LEGACY_API_KEY_WRITE_SCOPES]) {
			expect(API_KEY_MACHINE_SCOPES).toContain(scope);
		}
		expect(LEGACY_API_KEY_WRITE_SCOPES).not.toContain('audit:read');
		expect(LEGACY_API_KEY_WRITE_SCOPES).not.toContain('api_keys:update');
	});
});
