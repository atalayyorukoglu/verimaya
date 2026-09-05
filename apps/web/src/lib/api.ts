import type { ApiError } from '@verimaya/shared';
export { apiPaths, listUrl } from '@verimaya/shared';
import { PUBLIC_API_URL, USE_MSW } from '$lib/env';

export class ApiRequestError extends Error {
	readonly code: string;
	readonly status: number;
	readonly requestId?: string;

	constructor(status: number, body: ApiError | null) {
		super(body?.error.message ?? `İstek başarısız (${status})`);
		this.name = 'ApiRequestError';
		this.status = status;
		this.code = body?.error.code ?? 'unknown';
		this.requestId = body?.request_id;
	}
}

/** Resolve a contract path to a fetch URL (MSW same-origin in demo, real API otherwise). */
export function resolveApiUrl(path: string): string {
	if (path.startsWith('http://') || path.startsWith('https://')) return path;
	const normalized = path.startsWith('/') ? path : `/${path}`;
	if (USE_MSW && import.meta.env.DEV) return normalized;
	const base = PUBLIC_API_URL.replace(/\/$/, '');
	return `${base}${normalized}`;
}

function mockHeaders(): HeadersInit {
	if (typeof sessionStorage === 'undefined') return {};
	const scenario = sessionStorage.getItem('verimaya:mock-scenario');
	return scenario ? { 'x-mock-scenario': scenario } : {};
}

async function parseError(res: Response): Promise<never> {
	let body: ApiError | null = null;
	try {
		body = (await res.json()) as ApiError;
	} catch {
		/* ignore */
	}
	if (
		res.status === 401 &&
		!USE_MSW &&
		typeof window !== 'undefined' &&
		!window.location.pathname.startsWith('/login')
	) {
		window.location.assign('/login');
	}
	throw new ApiRequestError(res.status, body);
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
	return fetch(resolveApiUrl(path), {
		...init,
		credentials: 'include',
		headers: {
			Accept: 'application/json',
			...mockHeaders(),
			...init?.headers
		}
	});
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await apiFetch(path, init);
	if (!res.ok) await parseError(res);
	return res.json() as Promise<T>;
}

/** Fresh UUID for Idempotency-Key on every mutation (MONEY-01 / IDEM-01). */
export function newIdempotencyKey(): string {
	return crypto.randomUUID();
}

export async function apiSend<T>(
	path: string,
	method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
	body?: unknown,
	init?: RequestInit
): Promise<T> {
	const headers: Record<string, string> = {
		...(init?.headers as Record<string, string> | undefined)
	};
	if (body !== undefined) {
		headers['Content-Type'] = 'application/json';
	}
	const hasIdempotencyKey = Object.keys(headers).some((k) => k.toLowerCase() === 'idempotency-key');
	if (!hasIdempotencyKey) {
		headers['Idempotency-Key'] = newIdempotencyKey();
	}

	const res = await apiFetch(path, {
		...init,
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body)
	});

	if (!res.ok) await parseError(res);
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

/** Multipart upload (do not set Content-Type — browser sets boundary). */
export async function apiUpload<T>(
	path: string,
	formData: FormData,
	init?: RequestInit
): Promise<T> {
	const headers: Record<string, string> = {
		Accept: 'application/json',
		...(mockHeaders() as Record<string, string>)
	};
	const res = await fetch(resolveApiUrl(path), {
		...init,
		method: 'POST',
		credentials: 'include',
		headers,
		body: formData
	});
	if (!res.ok) await parseError(res);
	return res.json() as Promise<T>;
}

/** Binary download (xlsx etc.) — triggers browser save via blob URL. */
export async function apiDownload(path: string, fallbackFilename: string): Promise<void> {
	const res = await apiFetch(path);
	if (!res.ok) await parseError(res);
	const blob = await res.blob();
	const cd = res.headers.get('Content-Disposition') ?? '';
	const match = /filename="([^"]+)"/i.exec(cd);
	const filename = match?.[1] ?? fallbackFilename;
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.rel = 'noopener';
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

export const fieldClass =
	'border-border bg-surface text-text placeholder:text-text-faint box-border h-9 w-full min-w-0 max-w-full rounded-[6px] border px-3 text-sm outline-none focus:ring-2 focus:ring-brand/40';

/**
 * Liste sayfalarının filtre satırındaki seçici/kutu sınıfı (Finans + Randevular).
 *
 * `fieldClass`'tan ayrı çünkü davranışı farklı: mobilde 44px dokunma hedefi ve satırı
 * paylaşan `flex-1`, masaüstünde 36px ve sabit 10rem. Randevular kendi kopyasını
 * tutuyordu ve ayrışmıştı (8px köşe, `px-3`'ün `px-2`'yi ezmesi, 36px `+` butonu);
 * kullanıcı Finans'takini isteyince (2026-09-05) tek kaynağa alındı.
 */
export const filterFieldClass =
	'border-border bg-surface text-text h-11 min-w-0 flex-1 rounded-[6px] border px-2 text-xs outline-none focus:ring-2 focus:ring-brand/40 sm:px-3 sm:text-sm lg:h-9 lg:w-40 lg:flex-none lg:text-sm';

export const textareaClass =
	'border-border bg-surface text-text placeholder:text-text-faint box-border min-h-24 w-full min-w-0 max-w-full rounded-[6px] border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40';

export const labelClass = 'text-text-muted mb-1 block text-xs font-medium';
