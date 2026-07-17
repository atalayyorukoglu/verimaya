import type { ApiError } from '@verimaya/shared';

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

function mockHeaders(): HeadersInit {
	if (typeof sessionStorage === 'undefined') return {};
	const scenario = sessionStorage.getItem('verimaya:mock-scenario');
	return scenario ? { 'x-mock-scenario': scenario } : {};
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(path, {
		...init,
		headers: {
			Accept: 'application/json',
			...mockHeaders(),
			...init?.headers
		}
	});

	if (!res.ok) {
		let body: ApiError | null = null;
		try {
			body = (await res.json()) as ApiError;
		} catch {
			/* ignore */
		}
		throw new ApiRequestError(res.status, body);
	}

	return res.json() as Promise<T>;
}

export function listUrl(
	resource: string,
	params?: { cursor?: string | null; limit?: number; q?: string }
): string {
	const url = new URL(`/v1/${resource}`, 'http://local');
	if (params?.cursor) url.searchParams.set('cursor', params.cursor);
	if (params?.limit) url.searchParams.set('limit', String(params.limit));
	if (params?.q) url.searchParams.set('q', params.q);
	return `${url.pathname}${url.search}`;
}
