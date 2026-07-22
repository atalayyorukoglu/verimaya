import type { Grade, TrustCheckInput, TrustScoreResult } from './schema.js';

const DEFAULT_WEIGHT = 1;

function gradeFromScore(score: number): Grade {
	if (score >= 90) return 'A';
	if (score >= 75) return 'B';
	if (score >= 60) return 'C';
	if (score >= 40) return 'D';
	return 'F';
}

/** Weighted Data Trust Score (0–100). */
export function calculateTrustScore(checks: TrustCheckInput[]): TrustScoreResult {
	if (checks.length === 0) {
		return { score: 0, grade: 'F', checks: [] };
	}

	const normalized = checks.map((c) => {
		const weight = c.weight && c.weight > 0 ? c.weight : DEFAULT_WEIGHT;
		const clamped = Math.max(0, Math.min(100, c.score));
		return { ...c, score: clamped, weight, weighted: clamped * weight };
	});

	const totalWeight = normalized.reduce((s, c) => s + c.weight, 0);
	const score = Math.round(normalized.reduce((s, c) => s + c.weighted, 0) / totalWeight);

	return { score, grade: gradeFromScore(score), checks: normalized };
}
