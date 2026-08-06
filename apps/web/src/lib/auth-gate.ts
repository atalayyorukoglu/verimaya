import { goto } from '$app/navigation';
import { authClient } from '$lib/auth';
import { USE_MSW } from '$lib/env';
import { isMarketingHost } from '$lib/host';

const PUBLIC_PREFIXES = [
	'/login',
	'/vitrin',
	'/yapay-zeka-karnesi',
	'/kvkk-aydinlatma',
	'/app',
	'/crm',
	'/resources',
	'/tools'
] as const;

export function isPublicPath(pathname: string): boolean {
	if (pathname === '/' || pathname === '') {
		return isMarketingHost();
	}
	return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Client-side auth gate for the SPA panel.
 * Skipped when MSW demo is on. Marketing host `/` is public.
 * Public paths (except login redirect) skip getSession so apex hub never hangs on API CORS.
 */
export async function runAuthGate(pathname: string): Promise<void> {
	if (USE_MSW) return;

	const isLogin = pathname === '/login' || pathname.startsWith('/login/');
	if (!isLogin && isPublicPath(pathname)) return;

	const { data } = await authClient.getSession();
	const session = data?.session ?? null;

	if (isLogin) {
		if (session) await goto('/', { replaceState: true });
		return;
	}

	if (!session) {
		await goto('/login', { replaceState: true });
	}
}
