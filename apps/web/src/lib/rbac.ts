import { type UserRole, userRoleLabels, userRoleSchema } from '@verimaya/shared';

const STORAGE_KEY = 'verimaya:demo-role';

/** Nav href → roles that can see it. */
const NAV_ACCESS: Record<string, UserRole[]> = {
	'/': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/patients': ['owner', 'admin', 'manager', 'agent', 'readonly'],
	'/contacts': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/appointments': ['owner', 'admin', 'manager', 'agent', 'readonly'],
	'/scorecard': ['owner', 'admin', 'manager', 'readonly'],
	'/finance': ['owner', 'admin', 'manager', 'finance'],
	'/finance/ai-transaction': ['owner', 'admin', 'manager', 'finance'],
	'/finance/balances': ['owner', 'admin', 'manager', 'finance'],
	'/reports': ['owner', 'admin', 'manager', 'finance', 'readonly'],
	'/settings': ['owner', 'admin'],
	'/features': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/changelog': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
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
