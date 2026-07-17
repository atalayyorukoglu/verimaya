import { type UserRole, userRoleSchema } from '@verimaya/shared';

const STORAGE_KEY = 'verimaya:demo-role';

/** Nav href → minimum roles that can see it (owner/admin see all). */
const NAV_ACCESS: Record<string, UserRole[]> = {
	'/': ['owner', 'admin', 'manager', 'agent', 'finance', 'readonly'],
	'/hastalar': ['owner', 'admin', 'manager', 'agent', 'readonly'],
	'/randevular': ['owner', 'admin', 'manager', 'agent', 'readonly'],
	'/inbox': ['owner', 'admin', 'manager', 'agent'],
	'/finans': ['owner', 'admin', 'manager', 'finance'],
	'/raporlar': ['owner', 'admin', 'manager', 'finance', 'readonly'],
	'/baglantilar/ghl': ['owner', 'admin'],
	'/baglantilar/reklamlar': ['owner', 'admin', 'manager'],
	'/baglantilar/api': ['owner', 'admin'],
	'/yonetim/ekip': ['owner', 'admin'],
	'/yonetim/ayarlar': ['owner', 'admin'],
	'/yonetim/denetim': ['owner', 'admin']
};

export const roleLabels: Record<UserRole, string> = {
	owner: 'Sahip',
	admin: 'Yönetici',
	manager: 'Müdür',
	agent: 'Danışman',
	finance: 'Finans',
	readonly: 'Salt okunur'
};

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
	const allowed = NAV_ACCESS[href];
	if (!allowed) return true;
	return allowed.includes(role);
}
