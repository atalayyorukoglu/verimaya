/**
 * Bands, dimension weights, setup questions — Olcek-Profili-Spec.md v3 §§2–3, §4 headers.
 */

import type {
	DimensionMeta,
	ScorecardBandId,
	SetupQuestion,
	SetupQuestionId
} from './types.js';

export const SCORECARD_DIMENSIONS: readonly DimensionMeta[] = [
	{ id: 'strategy', label: 'Strateji', weight: 1.5 },
	{ id: 'data', label: 'Veri', weight: 1.5 },
	{ id: 'technology', label: 'Teknoloji', weight: 1 },
	{ id: 'people', label: 'İnsan', weight: 1 },
	{ id: 'process', label: 'Süreç', weight: 1 },
	{ id: 'governance', label: 'Yönetişim', weight: 1.5 },
	{ id: 'risk', label: 'Risk & Uyum', weight: 1.5 },
	{ id: 'measurement', label: 'Ölçüm', weight: 1.5 }
] as const;

export const SCORECARD_BAND_LABELS: Record<ScorecardBandId, string> = {
	'1-4': '1–4',
	'5-15': '5–15',
	'16+': '16+'
};

/**
 * Approximate denominator ranges from spec §6 "Yaklaşık payda"
 * (depends on setup answers; used for sanity tests).
 */
export const SCORECARD_APPROX_VALID_RANGE: Record<
	ScorecardBandId,
	{ min: number; max: number }
> = {
	'1-4': { min: 30, max: 34 },
	'5-15': { min: 37, max: 41 },
	'16+': { min: 40, max: 43 }
};

/** Setup questions (§3). No → gated criteria are N/A beyan. */
export const SCORECARD_SETUP_QUESTIONS: readonly SetupQuestion[] = [
	{
		id: 'S1',
		text: 'Orta kademe yöneticiniz var mı?',
		gatesCriterionIds: ['4.4']
	},
	{
		id: 'S2',
		text: 'Ayrı departman / fonksiyonlarınız var mı?',
		gatesCriterionIds: ['4.1', '4.2']
	},
	{
		id: 'S3',
		text: 'Yazılı süreç dokümanlarınız var mı?',
		gatesCriterionIds: ['5.5']
	}
] as const;

export function setupQuestionById(id: SetupQuestionId): SetupQuestion {
	const q = SCORECARD_SETUP_QUESTIONS.find((s) => s.id === id);
	if (!q) throw new Error(`Unknown setup question: ${id}`);
	return q;
}
