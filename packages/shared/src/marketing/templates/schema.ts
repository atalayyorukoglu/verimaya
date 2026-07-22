import { z } from 'zod';

export const templateKindSchema = z.enum([
	'utm',
	'ratio_3_2_2',
	'budget_60_30_10',
	'unit_economics'
]);
export type TemplateKind = z.infer<typeof templateKindSchema>;

export const utmParts = z.object({
	baseUrl: z.string(),
	campaign: z.string(),
	source: z.string(),
	medium: z.string(),
	content: z.string().optional(),
	term: z.string().optional()
});
export type UtmParts = z.infer<typeof utmParts>;
