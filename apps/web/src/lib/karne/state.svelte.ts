/**
 * Free AI scorecard flow state (Svelte 5 runes).
 * Import as `$lib/karne/state.svelte` (no `.ts` suffix).
 */

import type { IntakeBandId, IntakeEuId, KarneQuestionId } from '$lib/karne/questions';
import { intakeQuestions, karneQuestions } from '$lib/karne/questions';

export type KarneStep = 'intro' | 'intake' | 'questions' | 'result';

const STORAGE_KEY = 'verimaya:karne-session';

type PersistedSession = {
	band: IntakeBandId | null;
	eu: IntakeEuId | null;
	intakeIndex: number;
	questionIndex: number;
	answers: Partial<Record<KarneQuestionId, string>>;
	step: KarneStep;
};

let step = $state<KarneStep>('intro');
let intakeIndex = $state(0);
let questionIndex = $state(0);
let band = $state<IntakeBandId | null>(null);
let eu = $state<IntakeEuId | null>(null);
let answers = $state<Partial<Record<KarneQuestionId, string>>>({});

function readPersisted(): PersistedSession | null {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as PersistedSession;
	} catch {
		return null;
	}
}

function persist(): void {
	if (typeof sessionStorage === 'undefined') return;
	const payload: PersistedSession = {
		band,
		eu,
		intakeIndex,
		questionIndex,
		answers: { ...answers },
		step
	};
	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/** Restore flow after refresh (call from onMount). */
export function hydrateKarneFromSession(): void {
	const saved = readPersisted();
	if (!saved) return;
	band = saved.band;
	eu = saved.eu;
	intakeIndex = Math.min(Math.max(saved.intakeIndex, 0), intakeQuestions.length - 1);
	questionIndex = Math.min(Math.max(saved.questionIndex ?? 0, 0), karneQuestions.length - 1);
	answers = { ...(saved.answers ?? {}) };
	if (
		saved.step === 'intake' ||
		saved.step === 'questions' ||
		saved.step === 'result'
	) {
		step = saved.step;
	}
}

export function getKarneStep(): KarneStep {
	return step;
}

export function getIntakeIndex(): number {
	return intakeIndex;
}

export function getQuestionIndex(): number {
	return questionIndex;
}

export function getIntakeBand(): IntakeBandId | null {
	return band;
}

export function getIntakeEu(): IntakeEuId | null {
	return eu;
}

export function getKarneAnswers(): Partial<Record<KarneQuestionId, string>> {
	return answers;
}

export function setKarneStep(next: KarneStep): void {
	step = next;
	persist();
}

export function startKarne(): void {
	step = 'intake';
	intakeIndex = 0;
	persist();
}

export function resetKarne(): void {
	step = 'intro';
	intakeIndex = 0;
	questionIndex = 0;
	band = null;
	eu = null;
	answers = {};
	if (typeof sessionStorage !== 'undefined') {
		sessionStorage.removeItem(STORAGE_KEY);
	}
}

export function setIntakeBand(value: IntakeBandId): void {
	band = value;
	persist();
}

export function setIntakeEu(value: IntakeEuId): void {
	eu = value;
	persist();
}

export function currentIntakeAnswer(): IntakeBandId | IntakeEuId | null {
	return intakeIndex === 0 ? band : eu;
}

export function canAdvanceIntake(): boolean {
	return currentIntakeAnswer() !== null;
}

export function intakeBack(): void {
	if (intakeIndex === 0) {
		step = 'intro';
		persist();
		return;
	}
	intakeIndex -= 1;
	persist();
}

export function intakeNext(): void {
	if (!canAdvanceIntake()) return;
	if (intakeIndex >= intakeQuestions.length - 1) {
		step = 'questions';
		questionIndex = 0;
		persist();
		return;
	}
	intakeIndex += 1;
	persist();
}

export function currentQuestionId(): KarneQuestionId {
	return karneQuestions[questionIndex].id;
}

export function currentQuestionAnswer(): string | null {
	return answers[currentQuestionId()] ?? null;
}

export function setQuestionAnswer(choiceId: string): void {
	const id = currentQuestionId();
	answers = { ...answers, [id]: choiceId };
	persist();
}

export function canAdvanceQuestion(): boolean {
	return currentQuestionAnswer() !== null;
}

export function questionBack(): void {
	if (questionIndex === 0) {
		step = 'intake';
		intakeIndex = intakeQuestions.length - 1;
		persist();
		return;
	}
	questionIndex -= 1;
	persist();
}

export function questionNext(): void {
	if (!canAdvanceQuestion()) return;
	if (questionIndex >= karneQuestions.length - 1) {
		step = 'result';
		persist();
		return;
	}
	questionIndex += 1;
	persist();
}
