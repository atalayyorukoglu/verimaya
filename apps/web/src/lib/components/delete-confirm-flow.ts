/**
 * Two-step delete confirmation for edit dialogs (GAP-06b).
 * The gate lives here as a pure helper so "confirm → DELETE" can be unit-tested
 * without mounting Svelte (vitest runs in `environment: 'node'`, no jsdom).
 */

export type DeleteConfirmPhase = 'form' | 'confirm';

/** After the user confirms, invoke delete. Skips if still on the form step. */
export async function runConfirmedDelete(
	phase: DeleteConfirmPhase,
	deleteFn: () => Promise<void>
): Promise<'deleted' | 'skipped'> {
	if (phase !== 'confirm') return 'skipped';
	await deleteFn();
	return 'deleted';
}
