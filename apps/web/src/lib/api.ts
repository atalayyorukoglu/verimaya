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

export async function apiSend<T>(
	path: string,
	method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
	body?: unknown,
	init?: RequestInit
): Promise<T> {
	const res = await apiFetch(path, {
		...init,
		method,
		headers: {
			'Content-Type': 'application/json',
			...init?.headers
		},
		body: body === undefined ? undefined : JSON.stringify(body)
	});

	if (!res.ok) await parseError(res);
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

/** Multipart upload (do not set Content-Type — browser sets boundary). */
export async function apiUpload<T>(path: string, formData: FormData, init?: RequestInit): Promise<T> {
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

export const fieldClass =
	'border-border bg-surface text-text placeholder:text-text-faint h-9 w-full rounded-[6px] border px-3 text-sm outline-none focus:ring-2 focus:ring-brand/40';

export const textareaClass =
	'border-border bg-surface text-text placeholder:text-text-faint min-h-24 w-full rounded-[6px] border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40';

export const labelClass = 'text-text-muted mb-1 block text-xs font-medium';
