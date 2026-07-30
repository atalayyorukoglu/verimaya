/**
 * Product AI scorecard (login, tenant-scoped) — types.
 * Spec: Olcek-Profili-Spec.md v3. Distinct from free public karne (`apps/web/src/lib/karne/`).
 */

/** Headcount bands (§2). */
export type ScorecardBandId = '1-4' | '5-15' | '16+';

export const SCORECARD_BAND_IDS = ['1-4', '5-15', '16+'] as const satisfies readonly ScorecardBandId[];

/** Eight enabling dimensions (§4). Weights never change per band (§1c). */
export type ScorecardDimensionId =
	| 'strategy'
	| 'data'
	| 'technology'
	| 'people'
	| 'process'
	| 'governance'
	| 'risk'
	| 'measurement';

export const SCORECARD_DIMENSION_IDS = [
	'strategy',
	'data',
	'technology',
	'people',
	'process',
	'governance',
	'risk',
	'measurement'
] as const satisfies readonly ScorecardDimensionId[];

/** How a criterion applies in a given band (§4 legend). */
export type BandApplicabilityKind =
	/** ✅ — in the denominator */
	| 'valid'
	/** 🔄 — in the denominator; ask via restatedText */
	| 'restated'
	/** ⛔ — N/A declaration (visible; not silently dropped) */
	| 'na'
	/** 🔧 — depends on setup S1/S2/S3 */
	| 'setupGated';

/** Criticality callout (⬆️ / ⬆️⬆️) — display only, not weight (§1c). */
export type CriticalityLevel = 'elevated' | 'critical';

export type SetupQuestionId = 'S1' | 'S2' | 'S3';

/** 0–4 scale; null + naDeclared is the N/A beyan (§1b). */
export type ScorecardScore = 0 | 1 | 2 | 3 | 4;

export type ScorecardCriterionId = `${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}.${1 | 2 | 3 | 4 | 5 | 6}`;

export type ScorecardCriterion = {
	id: ScorecardCriterionId;
	dimension: ScorecardDimensionId;
	/** Canonical question text (Turkish — spec language). */
	text: string;
	bandApplicability: Record<ScorecardBandId, BandApplicabilityKind>;
	/** Per-band restated wording when kind is `restated` (and optionally setup+restated). */
	restatedText?: Partial<Record<ScorecardBandId, string>>;
	/** Present iff any band is `setupGated`. */
	setupQuestion?: SetupQuestionId;
	/** Per-band criticality markers (⬆️ / ⬆️⬆️). */
	criticalityNote?: Partial<Record<ScorecardBandId, CriticalityLevel>>;
};

export type SetupAnswers = {
	/** S1 — middle management exists → unlocks 4.4 */
	S1: boolean;
	/** S2 — separate departments/functions → unlocks 4.1, 4.2 */
	S2: boolean;
	/** S3 — written process docs → unlocks 5.5 */
	S3: boolean;
};

export type DimensionMeta = {
	id: ScorecardDimensionId;
	/** Spec label (TR). */
	label: string;
	/** Weight multiplier (§4 headers). */
	weight: number;
};

export type SetupQuestion = {
	id: SetupQuestionId;
	/** Spec question (TR). */
	text: string;
	/** Criterion ids that become N/A when answer is no. */
	gatesCriterionIds: readonly ScorecardCriterionId[];
};
