/**
 * Free AI scorecard flow state (Svelte 5 runes).
 * Import as `$lib/karne/state.svelte` (no `.ts` suffix).
 */

import type { IntakeBandId, IntakeEuId } from '$lib/karne/questions';
import { intakeQuestions } from '$lib/karne/questions';

export type KarneStep = 'intro' | 'intake' | 'questions' | 'result';

const STORAGE_KEY = 'verimaya:karne-intake';

type PersistedIntake = {
	band: IntakeBandId | null;
	eu: IntakeEuId | null;
	intakeIndex: number;
	step: KarneStep;
};

let step = $state<KarneStep>('intro');
let intakeIndex = $state(0);
let band = $state<IntakeBandId | null>(null);
let eu = $state<IntakeEuId | null>(null);

function readPersisted(): PersistedIntake | null {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as PersistedIntake;
	} catch {
		return null;
	}
}

function persist(): void {
	if (typeof sessionStorage === 'undefined') return;
	const payload: PersistedIntake = {
		band,
		eu,
		intakeIndex,
		step
	};
	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/** Restore intake answers after refresh (call from onMount). */
export function hydrateKarneFromSession(): void {
	const saved = readPersisted();
	if (!saved) return;
	band = saved.band;
	eu = saved.eu;
	intakeIndex = Math.min(Math.max(saved.intakeIndex, 0), intakeQuestions.length - 1);
	if (saved.step === 'intake' || saved.step === 'questions' || saved.step === 'result') {
		step = saved.step;
	}
}

export function getKarneStep(): KarneStep {
	return step;
}

export function getIntakeIndex(): number {
	return intakeIndex;
}

export function getIntakeBand(): IntakeBandId | null {
	return band;
}

export function getIntakeEu(): IntakeEuId | null {
	return eu;
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
	band = null;
	eu = null;
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
		persist();
		return;
	}
	intakeIndex += 1;
	persist();
}
