import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiPaths } from '@verimaya/shared';
import { runConfirmedDelete } from './delete-confirm-flow';
import { getStore } from '../mocks/data';
import { server } from '../mocks/server';

/**
 * GAP-06b: edit dialog sil → onay → DELETE.
 * Vitest is `environment: 'node'` (no jsdom), so we exercise the same
 * confirm gate the dialogs use and the DELETE path the finance page calls.
 */

const BASE = 'http://localhost';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('GAP-06b transaction delete confirm → DELETE', () => {
	it('stays on form until confirm is requested', async () => {
		const calls: string[] = [];
		const result = await runConfirmedDelete('form', async () => {
			calls.push('deleted');
		});
		expect(result).toBe('skipped');
		expect(calls).toEqual([]);
	});

	it('Sil → onay → DELETE removes the transaction via apiPaths.transaction', async () => {
		const store = getStore('default');
		const target = store.transactions[0];
		expect(target).toBeTruthy();
		const snapshot = { ...target };

		const result = await runConfirmedDelete('confirm', async () => {
			const res = await fetch(`${BASE}${apiPaths.transaction(target.id)}`, {
				method: 'DELETE'
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { id: string; deleted: boolean };
			expect(body).toEqual({ id: target.id, deleted: true });
		});

		expect(result).toBe('deleted');
		expect(store.transactions.find((t) => t.id === target.id)).toBeUndefined();

		// Restore shared MSW store for other suites in this process.
		store.transactions.unshift(snapshot);
	});

	it('Vazgeç returns to form without deleting', async () => {
		const store = getStore('default');
		const before = store.transactions.length;
		expect(before).toBeGreaterThan(0);

		// Vazgeç returns the dialog to 'form'; the gate must then refuse to delete.
		const result = await runConfirmedDelete('form', async () => {
			throw new Error('should not delete');
		});
		expect(result).toBe('skipped');
		expect(store.transactions.length).toBe(before);
	});
});
