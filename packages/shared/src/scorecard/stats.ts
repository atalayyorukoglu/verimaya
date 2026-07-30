/**
 * Assessment percentage / zero counts — Olcek-Profili-Spec.md §6.
 */

import {
	SCORECARD_CRITERIA,
	isCriterionInDenominator
} from './criteria.js';
import type { ScorecardBandId, SetupAnswers } from './types.js';

/** Maturity label bands from percentage (temporary thresholds — §6). */
export type ScorecardMaturityId = 'baslangic' | 'parcali' | 'tutarli' | 'olgun';

export const SCORECARD_MATURITY_THRESHOLDS = [
	{ id: 'baslangic' as const, minInclusive: 0, maxExclusive: 32 },
	{ id: 'parcali' as const, minInclusive: 32, maxExclusive: 56 },
	{ id: 'tutarli' as const, minInclusive: 56, maxExclusive: 80 },
	{ id: 'olgun' as const, minInclusive: 80, maxExclusive: 101 }
] as const;

export type AnswerLike = {
	criterionId: string;
	score: number | null;
	naDeclared: boolean;
};

export type AssessmentStats = {
	denominator: number;
	/** Applicable criteria with score === 0 (not N/A). */
	zeroCount: number;
	/** Applicable criteria that have a numeric score (incl. 0). */
	scoredCount: number;
	/** Sum of scores / (denominator * 4) * 100; null if denominator 0. */
	percentage: number | null;
	maturity: ScorecardMaturityId | null;
};

export function maturityFromPercentage(percentage: number): ScorecardMaturityId {
	if (percentage < 32) return 'baslangic';
	if (percentage < 56) return 'parcali';
	if (percentage < 80) return 'tutarli';
	return 'olgun';
}

export function computeAssessmentStats(
	band: ScorecardBandId,
	setup: SetupAnswers,
	answers: readonly AnswerLike[]
): AssessmentStats {
	const byId = new Map(answers.map((a) => [a.criterionId, a]));
	let denominator = 0;
	let zeroCount = 0;
	let scoredCount = 0;
	let scoreSum = 0;

	for (const criterion of SCORECARD_CRITERIA) {
		if (!isCriterionInDenominator(criterion, band, setup)) continue;
		denominator++;
		const ans = byId.get(criterion.id);
		if (!ans || ans.naDeclared || ans.score === null || ans.score === undefined) {
			continue;
		}
		scoredCount++;
		scoreSum += ans.score;
		if (ans.score === 0) zeroCount++;
	}

	const percentage =
		denominator === 0 ? null : Math.round((scoreSum / (denominator * 4)) * 1000) / 10;

	return {
		denominator,
		zeroCount,
		scoredCount,
		percentage,
		maturity: percentage === null ? null : maturityFromPercentage(percentage)
	};
}
