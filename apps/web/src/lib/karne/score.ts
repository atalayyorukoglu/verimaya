import type {
	IntakeBandId,
	IntakeEuId,
	KarneQuestion,
	KarneQuestionId
} from '$lib/karne/questions';
import { karneQuestions } from '$lib/karne/questions';

export type KarneAnswers = Partial<Record<KarneQuestionId, string>>;

export type KarneIntakeInput = {
	band: IntakeBandId | null;
	eu: IntakeEuId | null;
};

export type KarneResult = {
	zeroCount: number;
	answeredCount: number;
	zeroQuestions: KarneQuestion[];
	strongQuestions: KarneQuestion[];
	euExposure: boolean;
	topThreeWeak: KarneQuestion[];
};

const EU_PRIORITY_IDS: readonly KarneQuestionId[] = ['s4', 's8'];

function choiceScore(question: KarneQuestion, choiceId: string | undefined): 0 | 2 | 4 | null {
	if (!choiceId) return null;
	const choice = question.choices.find((c) => c.id === choiceId);
	return choice ? choice.score : null;
}

/**
 * Rank zero-score questions for the result screen.
 * With EU/UK exposure, criteria 7.6 (S4) and 7.4 (S8) come first; then spec order.
 */
function rankTopThreeWeak(zeros: KarneQuestion[], euExposure: boolean): KarneQuestion[] {
	if (!euExposure) return zeros.slice(0, 3);

	const prioritized: KarneQuestion[] = [];
	for (const id of EU_PRIORITY_IDS) {
		const q = zeros.find((z) => z.id === id);
		if (q) prioritized.push(q);
	}
	for (const q of zeros) {
		if (!prioritized.includes(q)) prioritized.push(q);
	}
	return prioritized.slice(0, 3);
}

/** Pure scorer — no weights; aggregate totals are never exposed on the result. */
export function scoreKarne(answers: KarneAnswers, intake: KarneIntakeInput): KarneResult {
	const zeroQuestions: KarneQuestion[] = [];
	const strongQuestions: KarneQuestion[] = [];
	let answeredCount = 0;

	for (const question of karneQuestions) {
		const score = choiceScore(question, answers[question.id]);
		if (score === null) continue;
		answeredCount += 1;
		if (score === 0) zeroQuestions.push(question);
		if (score === 4) strongQuestions.push(question);
	}

	const euExposure = intake.eu === 'evet';

	return {
		zeroCount: zeroQuestions.length,
		answeredCount,
		zeroQuestions,
		strongQuestions,
		euExposure,
		topThreeWeak: rankTopThreeWeak(zeroQuestions, euExposure)
	};
}
