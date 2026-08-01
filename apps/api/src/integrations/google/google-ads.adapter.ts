import type { AdsProviderAdapter, NormalizedAdMetricRow } from '../ads/ads.types';

export type GoogleAdsAdapterConfig = {
	clientId: string;
	clientSecret: string;
	developerToken: string;
	/** MCC manager customer id (digits only); sent as login-customer-id when set. */
	loginCustomerId?: string;
	/**
	 * Optional client account to report on (digits only). Use when OAuth user is an MCC
	 * and listAccessibleCustomers does not expose leaf accounts.
	 */
	customerId?: string;
	apiVersion?: string;
};

export type FetchFn = (
	input: string | URL | Request,
	init?: RequestInit
) => Promise<Response>;

type GoogleTokenResponse = {
	access_token?: string;
	refresh_token?: string;
	error?: string;
	error_description?: string;
};

type ListAccessibleCustomersResponse = {
	resourceNames?: string[];
	error?: { message?: string; status?: string };
};

type GoogleAdsMetrics = {
	costMicros?: string | number;
	cost_micros?: string | number;
	impressions?: string | number;
	clicks?: string | number;
};

type GoogleAdsResult = {
	segments?: { date?: string };
	campaign?: { id?: string | number };
	metrics?: GoogleAdsMetrics;
};

type SearchStreamBatch = {
	results?: GoogleAdsResult[];
};

type GoogleStoredSecret = {
	refreshToken: string;
	customerId: string;
};

/** Current GAQL REST major; sunset versions return HTML 404 instead of JSON. */
const DEFAULT_API_VERSION = 'v25';
const ADWORDS_SCOPE = 'https://www.googleapis.com/auth/adwords';

function utcToday(): string {
	return new Date().toISOString().slice(0, 10);
}

function googleErrorMessage(prefix: string, body: unknown, status: number): string {
	if (typeof body !== 'object' || body === null) {
		return `${prefix} (HTTP ${status})`;
	}
	const b = body as {
		error?: string | {
			message?: string;
			status?: string;
			details?: Array<{
				errors?: Array<{
					message?: string;
					errorCode?: Record<string, string>;
				}>;
			}>;
		};
		error_description?: string;
	};
	if (typeof b.error === 'string') {
		const detail = b.error_description?.trim() || b.error;
		return `${prefix}: ${detail}`;
	}

	const adsErrors = b.error?.details?.flatMap((d) => d.errors ?? []) ?? [];
	const coded = adsErrors
		.map((e) => {
			const code = e.errorCode ? Object.values(e.errorCode).find(Boolean) : undefined;
			const msg = e.message?.trim();
			if (code && msg) return `${code}: ${msg}`;
			return code || msg;
		})
		.find(Boolean);

	const detail = coded || b.error?.message?.trim() || b.error?.status?.trim();
	return detail ? `${prefix}: ${detail}` : `${prefix} (HTTP ${status})`;
}

function googlePullGuidance(failureText: string): string {
	const upper = failureText.toUpperCase();
	if (upper.includes('DEVELOPER_TOKEN_NOT_APPROVED')) {
		return 'Developer token is Test-only — apply for Basic/Standard in Google Ads API Center, or use a test client account.';
	}
	if (upper.includes('USER_PERMISSION_DENIED')) {
		return 'OAuth user cannot access this client — add the user on the client account, or confirm MCC login-customer-id.';
	}
	if (upper.includes('CUSTOMER_NOT_ENABLED') || upper.includes('NOT_ADS_USER')) {
		return 'That customer id is not an active Google Ads account under your MCC.';
	}
	return 'Check API Center access level, MCC link, and that the saved client id belongs to this manager.';
}

function formBody(params: Record<string, string>): string {
	return new URLSearchParams(params).toString();
}

async function readJsonBody<T>(res: Response, label: string): Promise<T> {
	const text = await res.text();
	const ctype = res.headers.get('content-type') ?? '';
	if (!ctype.includes('json') && text.trimStart().startsWith('<')) {
		throw new Error(
			`${label}: Google returned HTML (HTTP ${res.status}) — check GOOGLE_ADS_API_VERSION (use a current version, e.g. v25) and that Google Ads API is enabled`
		);
	}
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new Error(`${label}: non-JSON response (HTTP ${res.status})`);
	}
}

function normalizeLoginCustomerId(raw: string | undefined): string | undefined {
	const digits = raw?.replace(/\D/g, '').trim();
	return digits || undefined;
}

/**
 * Google Ads API adapter (OAuth offline + GAQL searchStream).
 * Inject fetchFn in tests; production uses globalThis.fetch.
 */
export class GoogleAdsAdapter implements AdsProviderAdapter {
	readonly provider = 'google' as const;
	private readonly apiVersion: string;
	private readonly loginCustomerId: string | undefined;
	private readonly configuredCustomerId: string | undefined;
	private readonly fetchFn: FetchFn;

	constructor(
		private readonly config: GoogleAdsAdapterConfig,
		fetchFn: FetchFn = globalThis.fetch.bind(globalThis)
	) {
		this.apiVersion = config.apiVersion?.trim() || DEFAULT_API_VERSION;
		this.loginCustomerId = normalizeLoginCustomerId(config.loginCustomerId);
		this.configuredCustomerId = normalizeLoginCustomerId(config.customerId);
		this.fetchFn = fetchFn;
	}

	private adsAuthHeaders(
		accessToken: string,
		opts?: { includeLoginCustomerId?: boolean }
	): Record<string, string> {
		const headers: Record<string, string> = {
			authorization: `Bearer ${accessToken}`,
			'developer-token': this.config.developerToken,
			'content-type': 'application/json'
		};
		if (opts?.includeLoginCustomerId !== false && this.loginCustomerId) {
			headers['login-customer-id'] = this.loginCustomerId;
		}
		return headers;
	}

	buildAuthorizeUrl(p: { state: string; redirectUri: string }): string {
		const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
		url.searchParams.set('client_id', this.config.clientId);
		url.searchParams.set('redirect_uri', p.redirectUri);
		url.searchParams.set('state', p.state);
		url.searchParams.set('response_type', 'code');
		url.searchParams.set('access_type', 'offline');
		url.searchParams.set('prompt', 'consent');
		url.searchParams.set('scope', ADWORDS_SCOPE);
		return url.toString();
	}

	async exchangeCode(p: { code: string; redirectUri: string }): Promise<{ secret: string }> {
		const tokenRes = await this.fetchFn('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: formBody({
				code: p.code,
				client_id: this.config.clientId,
				client_secret: this.config.clientSecret,
				redirect_uri: p.redirectUri,
				grant_type: 'authorization_code'
			})
		});
		const tokenBody = await readJsonBody<GoogleTokenResponse>(
			tokenRes,
			'Google token exchange failed'
		);
		if (!tokenRes.ok || !tokenBody.refresh_token || !tokenBody.access_token) {
			throw new Error(
				googleErrorMessage('Google token exchange failed', tokenBody, tokenRes.status)
			);
		}

		const customersUrl = `https://googleads.googleapis.com/${this.apiVersion}/customers:listAccessibleCustomers`;
		const customersRes = await this.fetchFn(customersUrl, {
			method: 'GET',
			headers: this.adsAuthHeaders(tokenBody.access_token, { includeLoginCustomerId: false })
		});
		const customersBody = await readJsonBody<ListAccessibleCustomersResponse>(
			customersRes,
			'Google listAccessibleCustomers failed'
		);
		if (!customersRes.ok) {
			throw new Error(
				googleErrorMessage(
					'Google listAccessibleCustomers failed',
					customersBody,
					customersRes.status
				)
			);
		}

		const resourceNames = customersBody.resourceNames ?? [];
		if (resourceNames.length === 0) {
			throw new Error('Google listAccessibleCustomers returned no customers');
		}

		// Prefer a non-MCC id: searchStream on manager accounts returns 403.
		const ids = resourceNames
			.map((name) => name.replace(/^customers\//, ''))
			.filter(Boolean);
		const customerId =
			ids.find((id) => id !== this.loginCustomerId) ?? ids[0];
		if (!customerId) {
			throw new Error('Google customer resource name missing id');
		}

		const secret: GoogleStoredSecret = {
			refreshToken: tokenBody.refresh_token,
			customerId
		};
		return { secret: JSON.stringify(secret) };
	}

	async pullDailyMetrics(p: { secret: string; since: string }): Promise<NormalizedAdMetricRow[]> {
		const stored = this.parseSecret(p.secret);
		const accessToken = await this.refreshAccessToken(stored.refreshToken);
		const candidates = await this.resolveReportCustomerIds(accessToken, stored.customerId);

		const until = utcToday();
		const query = [
			'SELECT segments.date, campaign.id, metrics.cost_micros, metrics.impressions, metrics.clicks',
			'FROM campaign',
			`WHERE segments.date BETWEEN '${p.since}' AND '${until}'`
		].join(' ');

		const out: NormalizedAdMetricRow[] = [];
		const failures: string[] = [];

		for (const customerId of candidates) {
			const res = await this.searchStream(accessToken, customerId, query);
			const body = await readJsonBody<unknown>(res, 'Google searchStream failed');
			if (!res.ok) {
				failures.push(
					`${customerId}: ${googleErrorMessage('searchStream', body, res.status)}`
				);
				continue;
			}
			const batches = this.normalizeStreamBatches(body);
			for (const batch of batches) {
				for (const row of batch.results ?? []) {
					const mapped = this.mapResultRow(row);
					if (mapped) out.push(mapped);
				}
			}
		}

		if (out.length === 0 && failures.length > 0) {
			const joined = failures.join(' | ');
			throw new Error(
				`Google Ads pull failed for all candidate accounts. ${joined}. ${googlePullGuidance(joined)}`
			);
		}

		return out;
	}

	private searchStream(
		accessToken: string,
		customerId: string,
		query: string
	): Promise<Response> {
		const streamUrl = `https://googleads.googleapis.com/${this.apiVersion}/customers/${customerId}/googleAds:searchStream`;
		return this.fetchFn(streamUrl, {
			method: 'POST',
			headers: this.adsAuthHeaders(accessToken),
			body: JSON.stringify({ query })
		});
	}

	/**
	 * Prefer tenant-saved client id (UI), then env override, then OAuth-accessible non-MCC accounts.
	 */
	private async resolveReportCustomerIds(
		accessToken: string,
		storedCustomerId: string
	): Promise<string[]> {
		const stored = storedCustomerId.replace(/\D/g, '');

		if (this.configuredCustomerId) {
			return [this.configuredCustomerId];
		}

		// Tenant UI: Google müşteri hesap no (saved into credential JSON).
		if (stored && stored !== this.loginCustomerId) {
			return [stored];
		}

		const accessible = await this.listAccessibleCustomerIds(accessToken);
		const withoutManager = accessible.filter((id) => id !== this.loginCustomerId);
		if (withoutManager.length > 0) {
			return withoutManager;
		}

		return accessible.length > 0 ? accessible : [stored || storedCustomerId];
	}

	private async listAccessibleCustomerIds(accessToken: string): Promise<string[]> {
		const customersUrl = `https://googleads.googleapis.com/${this.apiVersion}/customers:listAccessibleCustomers`;
		const customersRes = await this.fetchFn(customersUrl, {
			method: 'GET',
			headers: this.adsAuthHeaders(accessToken, { includeLoginCustomerId: false })
		});
		const customersBody = await readJsonBody<ListAccessibleCustomersResponse>(
			customersRes,
			'Google listAccessibleCustomers failed'
		);
		if (!customersRes.ok) {
			throw new Error(
				googleErrorMessage(
					'Google listAccessibleCustomers failed',
					customersBody,
					customersRes.status
				)
			);
		}
		return (customersBody.resourceNames ?? [])
			.map((name) => name.replace(/^customers\//, ''))
			.filter(Boolean);
	}
	private async refreshAccessToken(refreshToken: string): Promise<string> {
		const res = await this.fetchFn('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: formBody({
				grant_type: 'refresh_token',
				refresh_token: refreshToken,
				client_id: this.config.clientId,
				client_secret: this.config.clientSecret
			})
		});
		const body = await readJsonBody<GoogleTokenResponse>(res, 'Google token refresh failed');
		if (!res.ok || !body.access_token) {
			throw new Error(googleErrorMessage('Google token refresh failed', body, res.status));
		}
		return body.access_token;
	}

	private parseSecret(secret: string): GoogleStoredSecret {
		let parsed: unknown;
		try {
			parsed = JSON.parse(secret);
		} catch {
			throw new Error('Google credential secret is not valid JSON');
		}
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			typeof (parsed as GoogleStoredSecret).refreshToken !== 'string' ||
			typeof (parsed as GoogleStoredSecret).customerId !== 'string'
		) {
			throw new Error('Google credential secret missing refreshToken or customerId');
		}
		return parsed as GoogleStoredSecret;
	}

	private normalizeStreamBatches(body: unknown): SearchStreamBatch[] {
		if (Array.isArray(body)) {
			return body as SearchStreamBatch[];
		}
		if (typeof body === 'object' && body !== null && 'results' in body) {
			return [body as SearchStreamBatch];
		}
		return [];
	}

	private mapResultRow(row: GoogleAdsResult): NormalizedAdMetricRow | null {
		const date = row.segments?.date;
		const campaignId = row.campaign?.id;
		if (!date || campaignId == null) return null;

		const costRaw = row.metrics?.costMicros ?? row.metrics?.cost_micros ?? 0;
		const costMicros = Number(costRaw);
		const impressions = Number(row.metrics?.impressions ?? 0);
		const clicks = Number(row.metrics?.clicks ?? 0);

		return {
			provider: 'google',
			date,
			campaignId: String(campaignId),
			spendMinor: Number.isFinite(costMicros) ? Math.round(costMicros / 10_000) : 0,
			impressions: Number.isFinite(impressions) ? impressions : 0,
			clicks: Number.isFinite(clicks) ? clicks : 0
		};
	}
}

export function googleAdsAdapterFromEnv(fetchFn?: FetchFn): GoogleAdsAdapter {
	return new GoogleAdsAdapter(
		{
			clientId: process.env.GOOGLE_ADS_CLIENT_ID?.trim() ?? '',
			clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() ?? '',
			developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() ?? '',
			loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim(),
			customerId: process.env.GOOGLE_ADS_CUSTOMER_ID?.trim(),
			apiVersion: process.env.GOOGLE_ADS_API_VERSION?.trim() || DEFAULT_API_VERSION
		},
		fetchFn
	);
}
