import { type UserRole, userRoleLabels, userRoleSchema } from '@verimaya/shared';

const STORAGE_KEY = 'verimaya:demo-role';

/** Nav href → roles that can see it. */
const NAV_ACCESS: Record<string, UserRole[]> = {
	'/': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/hastalar': ['owner', 'admin', 'manager', 'agent', 'readonly'],
	'/kisiler': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/randevular': ['owner', 'admin', 'manager', 'agent', 'readonly'],
	'/finans': ['owner', 'admin', 'manager', 'finance'],
	'/finans/aktar': ['owner', 'admin', 'manager', 'finance'],
	'/finans/bakiyeler': ['owner', 'admin', 'manager', 'finance'],
	'/raporlar': ['owner', 'admin', 'manager', 'finance', 'readonly'],
	'/ayarlar': ['owner', 'admin'],
	'/ozellikler': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/yenilikler': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/dev': ['owner', 'admin']
};

export const roleLabels = userRoleLabels;

export function getDemoRole(): UserRole {
	if (typeof sessionStorage === 'undefined') return 'owner';
	const raw = sessionStorage.getItem(STORAGE_KEY);
	const parsed = userRoleSchema.safeParse(raw);
	return parsed.success ? parsed.data : 'owner';
}

export function setDemoRole(role: UserRole) {
	sessionStorage.setItem(STORAGE_KEY, role);
}

export function canSeeNav(href: string, role: UserRole): boolean {
	return canAccessPath(href, role);
}

/** Longest-prefix match against NAV_ACCESS. Unknown paths allowed. */
export function canAccessPath(pathname: string, role: UserRole): boolean {
	const keys = Object.keys(NAV_ACCESS).sort((a, b) => b.length - a.length);
	for (const key of keys) {
		if (pathname === key || pathname.startsWith(`${key}/`)) {
			return NAV_ACCESS[key]!.includes(role);
		}
	}
	return true;
}
