/**
 * Pure email-capture gate decisions (LEG-01).
 *
 * Deliberately free of any `$env`/`$app` imports so it can be exercised by plain Vitest
 * (`environment: 'node'`, no SvelteKit virtual modules) without mounting a component or
 * mocking SvelteKit internals. `KarneResult.svelte` feeds in the already-resolved
 * `KARNE_LEADS_ENABLED` flag; this module only encodes the render decision.
 */

export type EmailGatePosition = 'before-result' | 'after-result';

/**
 * Initial value for the "gate unlocked" component state.
 * Disabled leads (or a gate position other than `before-result`) start unlocked so the
 * result is never blocked behind a form that must not be shown.
 */
export function initialGateUnlocked(leadsEnabled: boolean, position: EmailGatePosition): boolean {
	return !leadsEnabled || position !== 'before-result';
}

/**
 * True when the blocking "submit email to see the result" gate should render.
 * Must be false whenever `leadsEnabled` is false — this is the fail-closed check that
 * keeps the lead form out of the DOM entirely while LEG-01 is pending legal approval.
 */
export function showsBlockingGate(
	leadsEnabled: boolean,
	position: EmailGatePosition,
	gateUnlocked: boolean
): boolean {
	return leadsEnabled && position === 'before-result' && !gateUnlocked;
}

/**
 * True when the non-blocking, inline email capture form should render after the result.
 * Must be false whenever `leadsEnabled` is false, for the same reason as `showsBlockingGate`.
 */
export function showsInlineCapture(leadsEnabled: boolean, position: EmailGatePosition): boolean {
	return leadsEnabled && position === 'after-result';
}
