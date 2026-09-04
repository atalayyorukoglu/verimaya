import { describe, expect, it } from 'vitest';
import {
	emptyUserUiPreferences,
	filterKnownProductModuleIds,
	meSchema,
	userUiPreferencesUpdateSchema
} from './index.js';

describe('product-modules / user UI preferences contract', () => {
	it('accepts known module ids and rejects unknown ones', () => {
		expect(
			userUiPreferencesUpdateSchema.safeParse({
				enabled_product_modules: ['campaign-assistant', 'untouched-contacts']
			}).success
		).toBe(true);
		expect(
			userUiPreferencesUpdateSchema.safeParse({
				enabled_product_modules: ['not-a-module']
			}).success
		).toBe(false);
	});

	it('filterKnownProductModuleIds drops unknowns and dedupes', () => {
		expect(
			filterKnownProductModuleIds([
				'campaign-assistant',
				'x',
				'campaign-assistant',
				'ai-accuracy'
			])
		).toEqual(['campaign-assistant', 'ai-accuracy']);
	});

	it('meSchema requires preferences', () => {
		const base = {
			id: '11111111-1111-4111-8111-111111111111',
			user_id: '11111111-1111-4111-8111-111111111111',
			email: 'a@example.com',
			display_name: 'A',
			created_at: '2026-01-01T00:00:00.000Z',
			tenant_id: '22222222-2222-4222-8222-222222222222',
			role: 'agent' as const,
			platform_admin: false
		};
		expect(meSchema.safeParse(base).success).toBe(false);
		expect(
			meSchema.safeParse({ ...base, preferences: emptyUserUiPreferences() }).success
		).toBe(true);
	});
});
