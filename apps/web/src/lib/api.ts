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

async function parseError(res: Response): Promise<never> {
	let body: ApiError | null = null;
	try {
		body = (await res.json()) as ApiError;
	} catch {
		/* ignore */
	}
	throw new ApiRequestError(res.status, body);
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

	if (!res.ok) await parseError(res);
	return res.json() as Promise<T>;
}

export async function apiSend<T>(
	path: string,
	method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
	body?: unknown,
	init?: RequestInit
): Promise<T> {
	const res = await fetch(path, {
		...init,
		method,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...mockHeaders(),
			...init?.headers
		},
		body: body === undefined ? undefined : JSON.stringify(body)
	});

	if (!res.ok) await parseError(res);
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

export function listUrl(
	resource: string,
	params?: {
		cursor?: string | null;
		limit?: number;
		q?: string;
		from?: string;
		to?: string;
		patient_id?: string | null;
		contact_id?: string | null;
		type_id?: string | null;
	}
): string {
	const url = new URL(`/v1/${resource}`, 'http://local');
	if (params?.cursor) url.searchParams.set('cursor', params.cursor);
	if (params?.limit) url.searchParams.set('limit', String(params.limit));
	if (params?.q) url.searchParams.set('q', params.q);
	if (params?.from) url.searchParams.set('from', params.from);
	if (params?.to) url.searchParams.set('to', params.to);
	if (params?.patient_id) url.searchParams.set('patient_id', params.patient_id);
	if (params?.contact_id) url.searchParams.set('contact_id', params.contact_id);
	if (params?.type_id) url.searchParams.set('type_id', params.type_id);
	return `${url.pathname}${url.search}`;
}

export const fieldClass =
	'border-border bg-surface text-text placeholder:text-text-faint h-9 w-full rounded-[6px] border px-3 text-sm outline-none focus:ring-2 focus:ring-brand/40';

export const textareaClass =
	'border-border bg-surface text-text placeholder:text-text-faint min-h-24 w-full rounded-[6px] border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40';

export const labelClass = 'text-text-muted mb-1 block text-xs font-medium';
