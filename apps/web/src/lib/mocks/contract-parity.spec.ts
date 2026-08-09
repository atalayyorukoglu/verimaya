import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { compareByCreatedAtDesc, compareByOccurredOnDesc } from '@verimaya/shared';
import { ATALAY_PATIENT_ID, CONTACT_KLINIK_ID, getStore } from './data';
import { server } from './server';

/**
 * CONTRACT-02 (Faz 2.2): MSW <-> API parity test suite, web half.
 *
 * The real API is unreachable from this sandbox (no docker/Postgres — see 0.3), so
 * this file can't literally call both backends and diff the responses. What it *can*
 * do, and does: lock in — as an executable spec — the exact filter/order/cursor
 * contract that `packages/shared/src/list-query.ts` documents and that the API's
 * services (`apps/api/src/{appointments,transactions,contacts,patients}/*.service.ts`)
 * implement. `apps/api/src/common/contract-parity.isolation.spec.ts` asserts the same
 * contract against a real Postgres tenant; together the two files are the parity
 * pair, run separately because they need different runtimes (MSW needs no DB, the
 * API half needs one).
 *
 * Covers all 4 resources x (filter + cursor), per the plan's acceptance criterion.
 */

const BASE = 'http://localhost';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

type Page<T> = {
	items: T[];
	next_cursor: string | null;
	type_counts?: Record<string, number>;
	status_counts?: Record<string, number>;
};

async function fetchPage<T>(path: string): Promise<Page<T>> {
	const res = await fetch(`${BASE}${path}`);
	expect(res.status).toBe(200);
	return (await res.json()) as Page<T>;
}

/** Walks every cursor page, asserting no id repeats across pages (stable pagination). */
async function fetchAllPages<T extends { id: string }>(path: string, limit: number): Promise<T[]> {
	const sep = path.includes('?') ? '&' : '?';
	let cursor: string | null = null;
	const seen = new Set<string>();
	const all: T[] = [];
	for (let i = 0; i < 100; i++) {
		const cursorParam: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
		const page: Page<T> = await fetchPage<T>(`${path}${sep}limit=${limit}${cursorParam}`);
		for (const item of page.items) {
			expect(seen.has(item.id)).toBe(false);
			seen.add(item.id);
		}
		all.push(...page.items);
		if (!page.next_cursor) return all;
		cursor = page.next_cursor;
	}
	throw new Error('fetchAllPages: too many pages, possible infinite loop');
}

describe('CONTRACT-02: MSW list endpoints match the shared filter + order contract', () => {
	const store = getStore('default');

	it('appointments: patient_id filter matches the store exactly, newest first', async () => {
		const expected = store.appointments
			.filter((a) => a.patient_id === ATALAY_PATIENT_ID)
			.sort(compareByCreatedAtDesc)
			.map((a) => a.id);
		expect(expected.length).toBeGreaterThan(0);
		const page = await fetchPage<{ id: string }>(
			`/v1/appointments?patient_id=${ATALAY_PATIENT_ID}&limit=100`
		);
		expect(page.items.map((a) => a.id)).toEqual(expected);
	});

	it('appointments: cursor pagination covers every row exactly once, in order', async () => {
		const expected = [...store.appointments].sort(compareByCreatedAtDesc).map((a) => a.id);
		const all = await fetchAllPages<{ id: string }>('/v1/appointments', 5);
		expect(all.map((a) => a.id)).toEqual(expected);
	});

	it('appointments: type_counts/status_counts match the filtered set (GAP-F09-21)', async () => {
		const filtered = store.appointments
			.filter((a) => a.patient_id === ATALAY_PATIENT_ID)
			.sort(compareByCreatedAtDesc);
		expect(filtered.length).toBeGreaterThan(0);

		const expectedType: Record<string, number> = {};
		const expectedStatus: Record<string, number> = {};
		for (const a of filtered) {
			const typeKey = a.appointment_type ?? '';
			expectedType[typeKey] = (expectedType[typeKey] ?? 0) + 1;
			expectedStatus[a.status] = (expectedStatus[a.status] ?? 0) + 1;
		}

		const page = await fetchPage<{ id: string } & {
			type_counts: Record<string, number>;
			status_counts: Record<string, number>;
		}>(`/v1/appointments?patient_id=${ATALAY_PATIENT_ID}&limit=1`);
		expect(page.items).toHaveLength(1);
		expect(page.next_cursor).toBeTruthy();
		expect(page.type_counts).toEqual(expectedType);
		expect(page.status_counts).toEqual(expectedStatus);
	});

	it('transactions: contact_id filter matches the store exactly', async () => {
		const expected = store.transactions
			.filter((t) => t.contact_id === CONTACT_KLINIK_ID)
			.sort(compareByOccurredOnDesc)
			.map((t) => t.id);
		expect(expected.length).toBeGreaterThan(0);
		const page = await fetchPage<{ id: string }>(
			`/v1/transactions?contact_id=${CONTACT_KLINIK_ID}&limit=100`
		);
		expect(page.items.map((t) => t.id)).toEqual(expected);
	});

	it('transactions: kind / status / category / q filters match the store (GAP-03)', async () => {
		const byKind = store.transactions
			.filter((t) => t.kind === 'expense')
			.sort(compareByOccurredOnDesc)
			.map((t) => t.id);
		expect(byKind.length).toBeGreaterThan(0);
		const kindPage = await fetchPage<{ id: string; kind: string }>(
			'/v1/transactions?kind=expense&limit=100'
		);
		expect(kindPage.items.map((t) => t.id)).toEqual(byKind);
		expect(kindPage.items.every((t) => t.kind === 'expense')).toBe(true);

		const byStatus = store.transactions
			.filter((t) => t.status === 'unpaid')
			.sort(compareByOccurredOnDesc)
			.map((t) => t.id);
		const statusPage = await fetchPage<{ id: string }>('/v1/transactions?status=unpaid&limit=100');
		expect(statusPage.items.map((t) => t.id)).toEqual(byStatus);

		const sample = store.transactions.find((t) => t.category);
		expect(sample?.category).toBeTruthy();
		const byCategory = store.transactions
			.filter((t) => t.category === sample!.category)
			.sort(compareByOccurredOnDesc)
			.map((t) => t.id);
		const catPage = await fetchPage<{ id: string }>(
			`/v1/transactions?category=${encodeURIComponent(sample!.category!)}&limit=100`
		);
		expect(catPage.items.map((t) => t.id)).toEqual(byCategory);

		const needle = 'atalay';
		const byQ = store.transactions
			.filter(
				(t) =>
					t.title.toLowerCase().includes(needle) ||
					(t.subtitle?.toLowerCase().includes(needle) ?? false) ||
					(t.category?.toLowerCase().includes(needle) ?? false) ||
					(t.patient_display_name?.toLowerCase().includes(needle) ?? false) ||
					(t.contact_label?.toLowerCase().includes(needle) ?? false) ||
					(t.description?.toLowerCase().includes(needle) ?? false)
			)
			.sort(compareByOccurredOnDesc)
			.map((t) => t.id);
		expect(byQ.length).toBeGreaterThan(0);
		const qPage = await fetchPage<{ id: string }>(`/v1/transactions?q=${needle}&limit=100`);
		expect(qPage.items.map((t) => t.id)).toEqual(byQ);
	});

	it('transactions: patient_id + cursor pagination covers every matching row exactly once', async () => {
		const expected = store.transactions
			.filter((t) => t.patient_id === ATALAY_PATIENT_ID)
			.sort(compareByOccurredOnDesc)
			.map((t) => t.id);
		expect(expected.length).toBeGreaterThan(0);
		const all = await fetchAllPages<{ id: string }>(
			`/v1/transactions?patient_id=${ATALAY_PATIENT_ID}`,
			2
		);
		expect(all.map((t) => t.id)).toEqual(expected);
	});

	it('contacts: type_id filter matches the store exactly', async () => {
		const klinikType = store.contactTypes.find((t) => t.name === 'Klinik')!;
		const expected = store.contacts
			.filter((c) => c.contact_type_id === klinikType.id)
			.sort(compareByCreatedAtDesc)
			.map((c) => c.id);
		expect(expected.length).toBeGreaterThan(0);
		const page = await fetchPage<{ id: string }>(`/v1/contacts?type_id=${klinikType.id}&limit=100`);
		expect(page.items.map((c) => c.id)).toEqual(expected);
	});

	it('contacts: cursor pagination covers every row exactly once, in order', async () => {
		const expected = [...store.contacts].sort(compareByCreatedAtDesc).map((c) => c.id);
		const all = await fetchAllPages<{ id: string }>('/v1/contacts', 3);
		expect(all.map((c) => c.id)).toEqual(expected);
	});

	it('patients: q filter matches the store exactly', async () => {
		const q = 'atalay';
		const expected = store.patients
			.filter(
				(p) =>
					p.full_name.toLowerCase().includes(q) ||
					(p.email?.toLowerCase().includes(q) ?? false) ||
					(p.phone?.includes(q) ?? false)
			)
			.sort(compareByCreatedAtDesc)
			.map((p) => p.id);
		expect(expected.length).toBeGreaterThan(0);
		const page = await fetchPage<{ id: string }>(`/v1/patients?q=${q}&limit=100`);
		expect(page.items.map((p) => p.id)).toEqual(expected);
	});

	it('patients: cursor pagination covers every row exactly once, in order', async () => {
		const expected = [...store.patients].sort(compareByCreatedAtDesc).map((p) => p.id);
		const all = await fetchAllPages<{ id: string }>('/v1/patients', 7);
		expect(all.map((p) => p.id)).toEqual(expected);
	});

	it('every list endpoint rejects an unknown query parameter with 400', async () => {
		for (const path of ['/v1/appointments', '/v1/transactions', '/v1/contacts', '/v1/patients']) {
			const res = await fetch(`${BASE}${path}?not_a_real_filter=1`);
			expect(res.status, `${path} should 400 on an unknown filter`).toBe(400);
			const body = (await res.json()) as { error?: { code?: string } };
			expect(body.error?.code).toBe('validation_error');
		}
	});
});
