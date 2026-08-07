/**
 * CACHE-01 (Faz 2.3): reactive tenant/user scope for `query-keys.ts`.
 *
 * `.svelte.ts` — uses `$derived` (Svelte 5 runes), so it must be called from a
 * component's `<script>` init (same rule as any other Svelte composable). Calling
 * this multiple times across components is cheap: it creates another
 * `createQuery(meQueryOptions)`, and TanStack Query dedupes those by the shared
 * `['me']` key — one network request, shared cache entry.
 *
 * IMPORTANT: do **not** destructure `keys` / `ready` / `scope`:
 *   // ❌ const { keys, ready } = useQueryScope(); // snapshot — stuck on hard refresh
 *   // ✅ const qs = useQueryScope();
 *   //    createQuery(() => ({ queryKey: qs.keys…, enabled: qs.ready }))
 *
 * Destructuring invokes getters once; after Cmd+Shift+R, `/v1/me` is still
 * pending so `ready` freezes as `false` and scoped queries never enable.
 */
import { createQuery, type QueryClient } from '@tanstack/svelte-query';
import { meQueryOptions } from './me-query';
import { queryKeys, type QueryScope } from './query-keys';

/**
 * CACHE-01 step 4: identity is about to change (logout, or org switch at login —
 * see `login/+page.svelte` and `AppShell.svelte`'s `signOut`). Cancel in-flight
 * queries first so a response for the *old* scope can't land after `clear()` and
 * silently repopulate the cache, then clear. The next scoped query mount (new
 * `keys.*` built from the freshly-refetched `/v1/me`) starts from empty, not from
 * a race.
 */
export async function resetQueryScope(queryClient: QueryClient): Promise<void> {
	await queryClient.cancelQueries();
	queryClient.clear();
}

export function useQueryScope() {
	const meQuery = createQuery(meQueryOptions);

	const scope = $derived<QueryScope>(
		meQuery.data ? { tenantId: meQuery.data.tenant_id, userId: meQuery.data.id } : null
	);
	const keys = $derived(queryKeys(scope));
	const ready = $derived(scope !== null);

	return {
		/** The underlying `GET /v1/me` query — reuse this instead of creating a second one for `role` etc. */
		get meQuery() {
			return meQuery;
		},
		/** `null` until `GET /v1/me` resolves — scoped queries should stay `enabled: false` until then. */
		get scope() {
			return scope;
		},
		get keys() {
			return keys;
		},
		/** `true` once the scope is known; combine with a resource's own loading state as needed. */
		get ready() {
			return ready;
		}
	};
}
