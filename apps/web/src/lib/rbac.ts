import { type UserRole, userRoleLabels } from '@verimaya/shared';

/** Nav href → roles that can see it. */
const NAV_ACCESS: Record<string, UserRole[]> = {
	'/': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/contacts': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/patients': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
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

/** Safest default while GET /v1/me is loading or unavailable — least privilege. */
export const DEFAULT_ROLE: UserRole = 'readonly';

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
