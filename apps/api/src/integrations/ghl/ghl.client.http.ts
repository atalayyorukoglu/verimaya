import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import {
	ghlOAuthClientFromEnv,
	parseGhlStoredSecret,
	type FetchFn,
	type GhlOAuthClient,
	type GhlStoredSecret
} from './ghl-oauth.client';
import { GHL_OAUTH_PROVIDER } from './ghl-oauth.state';
import { GhlSyncService } from './ghl.sync.service';
import type {
	GhlClient,
	GhlInboundEvent,
	GhlListContactsParams,
	GhlListContactsResult,
	GhlProcessResult,
	GhlRemoteContact
} from './ghl.types';

const API_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';
/** Align with BullMQ-style backoff: 1s, 2s, 4s (capped). */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_ATTEMPTS = 3;
/** Simple client-side spacing to stay under ~100 req / 10s class limits. */
const MIN_REQUEST_GAP_MS = 120;
const REFRESH_SKEW_MS = 60_000;

export type GhlHttpClientOptions = {
	fetchFn?: FetchFn;
	oauth?: GhlOAuthClient;
	apiBase?: string;
	minRequestGapMs?: number;
	sleepFn?: (ms: number) => Promise<void>;
	nowFn?: () => number;
};

type GhlContactApiRow = {
	id?: string;
	locationId?: string;
	firstName?: string;
	lastName?: string;
	name?: string;
	fullName?: string;
	phone?: string;
	email?: string;
	dateUpdated?: string;
	updatedAt?: string;
};

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapContact(row: GhlContactApiRow): GhlRemoteContact | null {
	const id = row.id?.trim();
	if (!id) return null;
	const fullName =
		row.fullName?.trim() ||
		row.name?.trim() ||
		[row.firstName, row.lastName].filter(Boolean).join(' ').trim() ||
		null;
	return {
		id,
		locationId: row.locationId?.trim() || null,
		fullName,
		phone: row.phone?.trim() || null,
		email: row.email?.trim() || null,
		dateUpdated: row.dateUpdated?.trim() || row.updatedAt?.trim() || null
	};
}

/**
 * Real LeadConnector HTTP client (OAuth bearer + Version header).
 * Retries 429/5xx with exponential backoff; refreshes token on 401 once.
 */
@Injectable()
export class GhlHttpClient implements GhlClient {
	private readonly logger = new Logger(GhlHttpClient.name);
	private readonly fetchFn: FetchFn;
	private readonly oauth: GhlOAuthClient;
	private readonly apiBase: string;
	private readonly minRequestGapMs: number;
	private readonly sleepFn: (ms: number) => Promise<void>;
	private readonly nowFn: () => number;
	private lastRequestAt = 0;

	constructor(
		private readonly syncService: GhlSyncService,
		private readonly settings: SettingsService,
		options: GhlHttpClientOptions = {}
	) {
		this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
		this.oauth = options.oauth ?? ghlOAuthClientFromEnv(this.fetchFn);
		this.apiBase = (options.apiBase ?? API_BASE).replace(/\/$/, '');
		this.minRequestGapMs = options.minRequestGapMs ?? MIN_REQUEST_GAP_MS;
		this.sleepFn = options.sleepFn ?? defaultSleep;
		this.nowFn = options.nowFn ?? Date.now;
	}

	async processInboundEvent(event: GhlInboundEvent): Promise<GhlProcessResult> {
		const result = await this.syncService.processInboundEvent(event);
		this.logger.log(
			`GHL inbound event ${event.integrationEventId} (tenant ${event.tenantId}): kind=${result.kind} action=${result.action}`
		);
		return result;
	}

	async getContact(tenantId: string, contactId: string): Promise<GhlRemoteContact | null> {
		const path = `/contacts/${encodeURIComponent(contactId)}`;
		const body = await this.authorizedJson<{ contact?: GhlContactApiRow }>(tenantId, path, {
			method: 'GET'
		});
		if (!body?.contact) return null;
		return mapContact(body.contact);
	}

	async listContacts(
		tenantId: string,
		params: GhlListContactsParams = {}
	): Promise<GhlListContactsResult> {
		const secret = await this.loadFreshSecret(tenantId);
		const locationId = secret.locationId;
		if (!locationId) {
			throw new Error('GHL credential missing locationId — reconnect OAuth');
		}

		const qs = new URLSearchParams();
		qs.set('locationId', locationId);
		const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
		qs.set('limit', String(limit));
		if (params.startAfterId) qs.set('startAfterId', params.startAfterId);
		if (params.query) qs.set('query', params.query);

		const body = await this.authorizedJson<{
			contacts?: GhlContactApiRow[];
			meta?: { nextPageUrl?: string; startAfterId?: string };
		}>(tenantId, `/contacts/?${qs.toString()}`, { method: 'GET' }, secret);

		const contacts = (body?.contacts ?? [])
			.map(mapContact)
			.filter((c): c is GhlRemoteContact => c !== null);
		const metaNext = body?.meta?.startAfterId?.trim() || null;
		const nextStartAfterId =
			metaNext ??
			(contacts.length === limit ? (contacts[contacts.length - 1]?.id ?? null) : null);

		return { contacts, nextStartAfterId };
	}

	private async loadFreshSecret(tenantId: string): Promise<GhlStoredSecret> {
		const raw = await this.settings.loadCredentialSecret(tenantId, GHL_OAUTH_PROVIDER);
		let stored = parseGhlStoredSecret(raw);
		if (stored.expiresAt <= this.nowFn() + REFRESH_SKEW_MS) {
			const { secret } = await this.oauth.refresh(JSON.stringify(stored));
			await this.settings.storeCredential(tenantId, GHL_OAUTH_PROVIDER, { secret });
			stored = parseGhlStoredSecret(secret);
		}
		return stored;
	}

	private async authorizedJson<T>(
		tenantId: string,
		path: string,
		init: RequestInit,
		preloaded?: GhlStoredSecret
	): Promise<T> {
		let secret = preloaded ?? (await this.loadFreshSecret(tenantId));
		let attemptedRefresh = false;

		for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
			await this.throttle();
			const res = await this.fetchFn(`${this.apiBase}${path}`, {
				...init,
				headers: {
					Accept: 'application/json',
					Authorization: `Bearer ${secret.accessToken}`,
					Version: API_VERSION,
					...(init.headers ?? {})
				}
			});

			if (res.status === 401 && !attemptedRefresh) {
				attemptedRefresh = true;
				const { secret: rotated } = await this.oauth.refresh(JSON.stringify(secret));
				await this.settings.storeCredential(tenantId, GHL_OAUTH_PROVIDER, {
					secret: rotated
				});
				secret = parseGhlStoredSecret(rotated);
				attempt -= 1;
				continue;
			}

			if (res.status === 429 || res.status >= 500) {
				if (attempt >= RETRY_MAX_ATTEMPTS) {
					throw new Error(`GHL API ${path} failed after retries (HTTP ${res.status})`);
				}
				const retryAfter = Number(res.headers.get('retry-after'));
				const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
					? retryAfter * 1000
					: RETRY_BASE_MS * 2 ** (attempt - 1);
				this.logger.warn(
					`GHL API ${path} HTTP ${res.status}; backoff ${delayMs}ms (attempt ${attempt})`
				);
				await this.sleepFn(delayMs);
				continue;
			}

			if (res.status === 404) {
				return null as T;
			}

			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(
					`GHL API ${path} failed (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`
				);
			}

			if (res.status === 204) {
				return null as T;
			}

			return (await res.json()) as T;
		}

		throw new Error(`GHL API ${path} exhausted retries`);
	}

	private async throttle(): Promise<void> {
		const now = this.nowFn();
		const wait = this.minRequestGapMs - (now - this.lastRequestAt);
		if (wait > 0) {
			await this.sleepFn(wait);
		}
		this.lastRequestAt = this.nowFn();
	}
}

/** True when Marketplace app env is present — select HTTP client over stub. */
export function ghlHttpClientEnvConfigured(): boolean {
	return Boolean(
		process.env.GHL_CLIENT_ID?.trim() && process.env.GHL_CLIENT_SECRET?.trim()
	);
}
