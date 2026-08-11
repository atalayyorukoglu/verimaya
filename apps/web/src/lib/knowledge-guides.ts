import type { MessageKey } from '$lib/i18n/messages';

export type KnowledgeGuide = {
	slug: string;
	titleKey: MessageKey;
	descriptionKey: MessageKey;
};

/** Rehber listesi — `/knowledge` hub + `/knowledge/[slug]` detay. */
export const knowledgeGuides: KnowledgeGuide[] = [
	{
		slug: 'ai-prep-guide',
		titleKey: 'knowledge.guide.aiPrepGuide.title',
		descriptionKey: 'knowledge.guide.aiPrepGuide.description'
	},
	{
		slug: 'keyword-selection',
		titleKey: 'knowledge.guide.keywordSelection.title',
		descriptionKey: 'knowledge.guide.keywordSelection.description'
	},
	{
		slug: 'sales-discounts',
		titleKey: 'knowledge.guide.salesDiscounts.title',
		descriptionKey: 'knowledge.guide.salesDiscounts.description'
	}
];

export function knowledgeGuideBySlug(slug: string): KnowledgeGuide | undefined {
	return knowledgeGuides.find((g) => g.slug === slug);
}
