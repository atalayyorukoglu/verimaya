export type {
	BandApplicabilityKind,
	CriticalityLevel,
	DimensionMeta,
	ScorecardBandId,
	ScorecardCriterion,
	ScorecardCriterionId,
	ScorecardDimensionId,
	ScorecardScore,
	SetupAnswers,
	SetupQuestion,
	SetupQuestionId
} from './types.js';
export {
	SCORECARD_BAND_IDS,
	SCORECARD_DIMENSION_IDS
} from './types.js';
export {
	SCORECARD_APPROX_VALID_RANGE,
	SCORECARD_BAND_LABELS,
	SCORECARD_DIMENSIONS,
	SCORECARD_SETUP_QUESTIONS,
	setupQuestionById
} from './bands.js';
export {
	SCORECARD_CRITERIA,
	SCORECARD_CRITERION_COUNT,
	countApplicableCriteria,
	criterionDisplayText,
	getCriterionById,
	isCriterionInDenominator
} from './criteria.js';
