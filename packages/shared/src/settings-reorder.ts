import { z } from 'zod';
import { uuid } from './common.js';

/**
 * GAP-27: bulk absolute-set reorder for settings dictionaries that already expose
 * `sort_order` (contact_types, appointment_types, finance_categories).
 * Same max(500) + foreign-id skip + `{ updated }` count pattern as contacts bulk-type.
 */
export const SETTINGS_REORDER_MAX_ITEMS = 500 as const;

export const settingsReorderItemSchema = z
	.object({
		id: uuid,
		sort_order: z.number().int().nonnegative()
	})
	.strict();

export const settingsReorderSchema = z
	.object({
		items: z.array(settingsReorderItemSchema).min(1).max(SETTINGS_REORDER_MAX_ITEMS)
	})
	.strict()
	.superRefine((body, ctx) => {
		const seen = new Set<string>();
		for (const item of body.items) {
			if (seen.has(item.id)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Duplicate id in reorder items',
					path: ['items']
				});
				return;
			}
			seen.add(item.id);
		}
	});

export type SettingsReorder = z.infer<typeof settingsReorderSchema>;

export const settingsReorderResultSchema = z.object({
	updated: z.number().int().nonnegative()
});

export type SettingsReorderResult = z.infer<typeof settingsReorderResultSchema>;
