import type { MeOrganization } from '@verimaya/shared';
import { apiGet, apiPaths } from '$lib/api';
import { authClient } from '$lib/auth';

export type OrganizationSummary = MeOrganization;

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

export type OrgGateResult =
	| { action: 'proceed' }
	| { action: 'pick'; organizations: OrganizationSummary[] }
	| { action: 'create' };

/** After sign-in: auto-set sole org, or prompt pick/create when none active. */
export async function checkOrganizationGate(): Promise<OrgGateResult> {
	const activeId = await getActiveOrganizationId();
	if (activeId) return { action: 'proceed' };

	const orgs = await listUserOrganizations();
	if (orgs.length === 1) {
		await setActiveOrganization(orgs[0]!.id);
		return { action: 'proceed' };
	}
	if (orgs.length > 1) return { action: 'pick', organizations: orgs };
	return { action: 'create' };
}
