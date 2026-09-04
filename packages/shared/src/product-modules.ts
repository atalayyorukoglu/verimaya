import { z } from 'zod';

/**
 * Canonical ids for toggleable “Araçlar” sidebar modules.
 * Shared by API validation and the web catalog — keep in sync with UI entries.
 */
export const PRODUCT_MODULE_IDS = [
	'campaign-assistant',
	'untouched-contacts',
	'cohorts',
	'referral-value',
	'interventions',
	'ai-accuracy'
] as const;

export type ProductModuleId = (typeof PRODUCT_MODULE_IDS)[number];

export const productModuleIdSchema = z.enum(PRODUCT_MODULE_IDS);

/** Known product-module ids as a Set (filters / catalog checks). */
export const PRODUCT_MODULE_ID_SET: ReadonlySet<string> = new Set(PRODUCT_MODULE_IDS);

export const userUiPreferencesSchema = z.object({
	enabled_product_modules: z.array(productModuleIdSchema)
});

export type UserUiPreferences = z.infer<typeof userUiPreferencesSchema>;

/** PUT /v1/me/preferences — full replace of enabled modules. */
export const userUiPreferencesUpdateSchema = userUiPreferencesSchema;

export type UserUiPreferencesUpdate = z.infer<typeof userUiPreferencesUpdateSchema>;

export function emptyUserUiPreferences(): UserUiPreferences {
	return { enabled_product_modules: [] };
}

/** Drop unknown ids; keep order of first occurrence among known ids. */
export function filterKnownProductModuleIds(ids: readonly string[]): ProductModuleId[] {
	const out: ProductModuleId[] = [];
	const seen = new Set<string>();
	for (const id of ids) {
		if (!PRODUCT_MODULE_ID_SET.has(id) || seen.has(id)) continue;
		seen.add(id);
		out.push(id as ProductModuleId);
	}
	return out;
}
