import type { Me } from '@verimaya/shared';
import { apiGet, apiPaths } from '$lib/api';

/**
 * Shared TanStack Query options for `GET /v1/me` — the server-resolved
 * membership (role + platform_admin). Multiple components create their own query
 * with this same key; TanStack Query dedupes the network call and shares
 * the cached result (same pattern as the `['tenants', 'current']` query).
 */
export const meQueryOptions = () => ({
	queryKey: ['me'] as const,
	queryFn: () => apiGet<Me>(apiPaths.me),
	staleTime: 60_000
});
