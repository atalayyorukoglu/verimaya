/**
 * CACHE-01 (Faz 2.3): centralized, tenant+user-scoped TanStack Query key factory.
 *
 * Every key produced here starts with `['app', tenantId, userId, ...]`. That scope
 * prefix is what actually closes the gap CACHE-01 targets: `e666b28` (CACHE-02)
 * already calls `queryClient.clear()` on logout and on org switch, so in the two
 * places the app currently changes identity, stale cross-scope data can't survive.
 * But that's a single blunt "clear everything, everywhere" call — if any future
 * code path ever changes the active org/session without going through those two
 * spots (or a `clear()` call races a background refetch), a scopeless key like
 * `['patients', {...}]` would happily keep serving org A's cached patients under
 * org B's session. A scoped key structurally can't do that: org B's queries live
 * under a different cache key entirely, so there is nothing to accidentally serve
 * stale — the defense doesn't depend on remembering to clear.
 *
 * Two intentional exceptions, not scoped:
 * - `['me']` (see `me-query.ts`) — it's the query that *produces* tenantId/userId,
 *   so it can't be keyed by them. `useQueryScope()` clears/refetches it the same
 *   way as everything else on logout/switch.
 * - `dev.*` (`apps/web/src/routes/dev/+page.svelte`) — the superadmin panel that
 *   lists/edits *other* tenants by design; scoping it to "current tenant" would be
 *   wrong, not safer.
 */

export type QueryScope = { tenantId: string; userId: string } | null;

type Params = Record<string, unknown>;

function scopedKey(scope: QueryScope, ...segments: unknown[]) {
	return ['app', scope?.tenantId ?? null, scope?.userId ?? null, ...segments] as const;
}

export function queryKeys(scope: QueryScope) {
	const k = (...segments: unknown[]) => scopedKey(scope, ...segments);

	return {
		tenants: {
			current: () => k('tenants', 'current')
		},
		appointments: {
			all: () => k('appointments'),
			list: (params: Params = {}) => k('appointments', params)
		},
		transactions: {
			all: () => k('transactions'),
			list: (params: Params = {}) => k('transactions', params)
		},
		incentives: {
			all: () => k('incentives'),
			list: (params: Params = {}) => k('incentives', params)
		},
		commissions: {
			all: () => k('commissions'),
			list: (params: Params = {}) => k('commissions', params)
		},
		contacts: {
			all: () => k('contacts'),
			list: (params: Params = {}) => k('contacts', params),
			detail: (id: string) => k('contacts', id),
			financeSummary: (id: string) => k('contacts', id, 'finance-summary'),
			files: (id: string) => k('contacts', id, 'files'),
			caseNotes: (id: string) => k('contacts', id, 'case-notes'),
			duplicateGroups: () => k('contacts', 'duplicate-groups')
		},
		settings: {
			appointmentTypes: () => k('settings', 'appointment-types'),
			contactTypes: () => k('settings', 'contact-types'),
			organizations: () => k('settings', 'organizations'),
			financeCategories: () => k('settings', 'finance-categories'),
			aiDisclosure: () => k('settings', 'ai-disclosure'),
			aiPrompt: () => k('settings', 'ai-prompt'),
			incentiveDeadline: () => k('settings', 'incentive-deadline'),
			permissions: () => k('settings', 'permissions'),
			apiKeys: () => k('settings', 'api-keys'),
			webhookSubscriptions: () => k('settings', 'webhook-subscriptions'),
			trustScore: () => k('settings', 'trust-score')
		},
		integrations: {
			adsStatus: () => k('integrations', 'ads', 'status'),
			ghlStatus: () => k('integrations', 'ghl', 'status')
		},
		auditLogs: {
			list: (params: Params = {}) => k('audit-logs', params)
		},
		members: {
			all: () => k('members'),
			list: (params: Params = {}) => k('members', params)
		},
		whatsapp: {
			inbox: () => k('whatsapp', 'inbox'),
			corrections: () => k('whatsapp', 'corrections'),
			correctionsReport: (params: Params = {}) => k('whatsapp', 'corrections-report', params)
		},
		reports: {
			all: () => k('reports'),
			summary: (params: Params) => k('reports', 'summary', params),
			dashboardSummary: (params: Params) => k('reports', 'summary', 'dashboard', params),
			byCategory: (params: Params) => k('reports', 'by-category', params),
			byCategoryDetail: (params: Params) => k('reports', 'by-category-detail', params),
			byResponsible: (params: Params) => k('reports', 'by-responsible', params),
			monthly: (params: Params) => k('reports', 'monthly', params),
			marketing: (params: Params) => k('reports', 'marketing', params),
			contactDistribution: (params: Params) => k('reports', 'contact-distribution', params),
			appointmentMetrics: (params: Params) => k('reports', 'appointment-metrics', params),
			consistency: (params: Params) => k('reports', 'consistency', params),
			transactionDuplicates: (params: Params) => k('reports', 'transaction-duplicates', params),
			untouchedContacts: (params: Params) => k('reports', 'untouched-contacts', params),
			balances: () => k('reports', 'balances'),
			commissionSummary: () => k('reports', 'commission-summary')
		},
		scorecard: {
			current: () => k('scorecard', 'current'),
			compare: (previousId: string, currentId: string) =>
				k('scorecard', 'compare', previousId, currentId)
		},
		search: {
			query: (q: string) => k('search', q)
		},
		fx: {
			rate: (params: { from: string; to: string; on: string }) => k('fx', 'rate', params)
		}
	};
}

export type QueryKeys = ReturnType<typeof queryKeys>;
