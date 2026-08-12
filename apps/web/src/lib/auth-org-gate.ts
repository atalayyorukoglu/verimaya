export type OrganizationSummary = {
	id: string;
	name: string;
	slug: string;
};

export type OrgGateResult =
	| { action: 'proceed' }
	| { action: 'pick'; organizations: OrganizationSummary[] }
	| { action: 'create' };

export type OrgGateDecision =
	| OrgGateResult
	| { action: 'activate'; organizationId: string };

/**
 * Pure gate: a soft-deleted org (absent from `orgs`) is never active or auto-picked.
 * `orgs` must already be the live list from `listUserOrganizations`.
 */
export function resolveOrganizationGate(
	activeId: string | null,
	orgs: OrganizationSummary[]
): OrgGateDecision {
	if (activeId && orgs.some((o) => o.id === activeId)) {
		return { action: 'proceed' };
	}
	if (orgs.length === 1) {
		return { action: 'activate', organizationId: orgs[0]!.id };
	}
	if (orgs.length > 1) return { action: 'pick', organizations: orgs };
	return { action: 'create' };
}
