/**
 * Free AI scorecard flow state (Svelte 5 runes).
 * Import as `$lib/karne/state.svelte` (no `.ts` suffix).
 */

export type KarneStep = 'intro' | 'intake' | 'questions' | 'result';

let step = $state<KarneStep>('intro');

export function getKarneStep(): KarneStep {
	return step;
}

export function setKarneStep(next: KarneStep): void {
	step = next;
}

export function startKarne(): void {
	step = 'intake';
}

export function resetKarne(): void {
	step = 'intro';
}
