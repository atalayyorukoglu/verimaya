import { type UserRole, userRoleLabels } from '@verimaya/shared';

/** Nav href → roles that can see it. */
const NAV_ACCESS: Record<string, UserRole[]> = {
	'/contacts': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/patients': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/appointments': ['owner', 'admin', 'manager', 'agent', 'readonly'],
	'/scorecard': ['owner', 'admin', 'manager', 'readonly'],
	'/toolkit': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/knowledge': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/resources/ai-prep': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/resources/docs': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/marketing': ['owner', 'admin', 'manager', 'readonly'],
	'/finance': ['owner', 'admin', 'manager', 'finance'],
	'/finance/ai-transaction': ['owner', 'admin', 'manager', 'finance'],
	'/finance/balances': ['owner', 'admin', 'manager', 'finance'],
	'/reports': ['owner', 'admin', 'manager', 'finance', 'readonly'],
	/*
	 * Rapor sayfaları üst seviyeye taşındı (2026-09-04). Önceden `/reports` önekine
	 * takıldıkları için izinleri oradan miras alıyorlardı; üst seviyede eşleşme
	 * bulunmayınca `canAccessPath` bilinmeyen yolu SERBEST sayar ve `agent` rolü de
	 * görürdü. Aynı izin listesi burada açıkça tekrarlanıyor.
	 */
	'/ai-accuracy': ['owner', 'admin', 'manager', 'finance', 'readonly'],
	'/cohorts': ['owner', 'admin', 'manager', 'finance', 'readonly'],
	'/interventions': ['owner', 'admin', 'manager', 'finance', 'readonly'],
	'/referrals': ['owner', 'admin', 'manager', 'finance', 'readonly'],
	'/untouched': ['owner', 'admin', 'manager', 'finance', 'readonly'],
	'/settings': ['owner', 'admin'],
	'/maya': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/changelog': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/account': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	/** Real gate is `platform_admin` / MSW-DEV; org role not used. */
	'/dev': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly']
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
