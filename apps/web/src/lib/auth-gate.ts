import { goto } from '$app/navigation';
import { authClient } from '$lib/auth';
import { USE_MSW } from '$lib/env';

const PUBLIC_PREFIXES = [
	'/login',
	'/vitrin',
	'/yapay-zeka-karnesi',
	'/kvkk-aydinlatma'
] as const;

export function isPublicPath(pathname: string): boolean {
	return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Client-side auth gate for the SPA panel.
 * Skipped when MSW demo is on. Returns after redirects are kicked off.
 */
export async function runAuthGate(pathname: string): Promise<void> {
	if (USE_MSW) return;

	const { data } = await authClient.getSession();
	const session = data?.session ?? null;

	if (pathname === '/login' || pathname.startsWith('/login/')) {
		if (session) await goto('/', { replaceState: true });
		return;
	}

	if (isPublicPath(pathname)) return;

	if (!session) {
		await goto('/login', { replaceState: true });
	}
}
