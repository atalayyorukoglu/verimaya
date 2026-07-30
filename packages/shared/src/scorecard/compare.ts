/**
 * Compare two completed assessments on the same profile (§6 closed zeros).
 */

export type ScoreLike = {
	criterionId: string;
	score: number | null;
	naDeclared: boolean;
};

export type CriterionTransition = {
	criterionId: string;
	previousScore: number | null;
	currentScore: number | null;
	/** Was 0 before and is now > 0 (primary product signal). */
	closedZero: boolean;
};

export type ComparisonResult = {
	closedZeros: number;
	openedZeros: number;
	previousZeroCount: number;
	currentZeroCount: number;
	transitions: CriterionTransition[];
};

function effectiveScore(a: ScoreLike | undefined): number | null {
	if (!a || a.naDeclared) return null;
	return a.score;
}

export function buildAssessmentComparison(
	previous: readonly ScoreLike[],
	current: readonly ScoreLike[]
): ComparisonResult {
	const prevMap = new Map(previous.map((a) => [a.criterionId, a]));
	const currMap = new Map(current.map((a) => [a.criterionId, a]));
	const ids = new Set([...prevMap.keys(), ...currMap.keys()]);

	const transitions: CriterionTransition[] = [];
	let closedZeros = 0;
	let openedZeros = 0;
	let previousZeroCount = 0;
	let currentZeroCount = 0;

	for (const criterionId of [...ids].sort()) {
		const previousScore = effectiveScore(prevMap.get(criterionId));
		const currentScore = effectiveScore(currMap.get(criterionId));
		if (previousScore === 0) previousZeroCount++;
		if (currentScore === 0) currentZeroCount++;
		const closedZero = previousScore === 0 && currentScore !== null && currentScore > 0;
		const openedZero = previousScore !== null && previousScore > 0 && currentScore === 0;
		if (closedZero) closedZeros++;
		if (openedZero) openedZeros++;
		transitions.push({
			criterionId,
			previousScore,
			currentScore,
			closedZero
		});
	}

	return {
		closedZeros,
		openedZeros,
		previousZeroCount,
		currentZeroCount,
		transitions
	};
}
