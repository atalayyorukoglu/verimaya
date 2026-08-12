import type { MeOrganization } from '@verimaya/shared';
import { apiGet, apiPaths } from '$lib/api';
import { authClient } from '$lib/auth';
import { resolveOrganizationGate, type OrgGateResult } from './auth-org-gate';

export type OrganizationSummary = MeOrganization;
export type { OrgGateResult };
export { resolveOrganizationGate };

export async function getActiveOrganizationId(): Promise<string | null> {
	const { data } = await authClient.getSession();
	return data?.session?.activeOrganizationId ?? null;
}

/** Active (non-soft-deleted) orgs only — server intersects better-auth memberships with tenants. */
export async function listUserOrganizations(): Promise<OrganizationSummary[]> {
	const data = await apiGet<{ items: OrganizationSummary[] }>(apiPaths.meOrganizations);
	return data.items;
}

export async function setActiveOrganization(organizationId: string): Promise<void> {
	const { error } = await authClient.organization.setActive({ organizationId });
	if (error) throw new Error(error.message ?? 'Organizasyon seçilemedi');
}

export async function createOrganization(name: string, slug: string): Promise<OrganizationSummary> {
	const { data, error } = await authClient.organization.create({ name, slug });
	if (error) throw new Error(error.message ?? 'Organizasyon oluşturulamadı');
	if (!data) throw new Error('Organizasyon oluşturulamadı');
	return data as OrganizationSummary;
}

export function slugifyOrganizationName(name: string): string {
	const base = name
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return base || 'org';
}

/** After sign-in: auto-set sole live org, or prompt pick/create. Deleted active org is ignored. */
export async function checkOrganizationGate(): Promise<OrgGateResult> {
	const [activeId, orgs] = await Promise.all([
		getActiveOrganizationId(),
		listUserOrganizations()
	]);
	const decision = resolveOrganizationGate(activeId, orgs);
	if (decision.action === 'activate') {
		await setActiveOrganization(decision.organizationId);
		return { action: 'proceed' };
	}
	return decision;
}
