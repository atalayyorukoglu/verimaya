import type { AdsProviderAdapter, NormalizedAdMetricRow } from '../ads/ads.types';

export type GoogleAdsAdapterConfig = {
	clientId: string;
	clientSecret: string;
	developerToken: string;
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

const DEFAULT_API_VERSION = 'v17';
const ADWORDS_SCOPE = 'https://www.googleapis.com/auth/adwords';

function utcToday(): string {
	return new Date().toISOString().slice(0, 10);
}

function googleErrorMessage(
	prefix: string,
	body: { error?: string | { message?: string }; error_description?: string },
	status: number
): string {
	if (typeof body.error === 'string') {
		const detail = body.error_description?.trim() || body.error;
		return `${prefix}: ${detail}`;
	}
	const detail = body.error?.message?.trim();
	return detail ? `${prefix}: ${detail}` : `${prefix} (HTTP ${status})`;
}

function formBody(params: Record<string, string>): string {
	return new URLSearchParams(params).toString();
}

/**
 * Google Ads API adapter (OAuth offline + GAQL searchStream).
 * Inject fetchFn in tests; production uses globalThis.fetch.
 */
export class GoogleAdsAdapter implements AdsProviderAdapter {
	readonly provider = 'google' as const;
	private readonly apiVersion: string;
	private readonly fetchFn: FetchFn;

	constructor(
		private readonly config: GoogleAdsAdapterConfig,
		fetchFn: FetchFn = globalThis.fetch.bind(globalThis)
	) {
		this.apiVersion = config.apiVersion?.trim() || DEFAULT_API_VERSION;
		this.fetchFn = fetchFn;
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
		const tokenBody = (await tokenRes.json()) as GoogleTokenResponse;
		if (!tokenRes.ok || !tokenBody.refresh_token || !tokenBody.access_token) {
			throw new Error(
				googleErrorMessage('Google token exchange failed', tokenBody, tokenRes.status)
			);
		}

		const customersUrl = `https://googleads.googleapis.com/${this.apiVersion}/customers:listAccessibleCustomers`;
		const customersRes = await this.fetchFn(customersUrl, {
			method: 'GET',
			headers: {
				authorization: `Bearer ${tokenBody.access_token}`,
				'developer-token': this.config.developerToken
			}
		});
		const customersBody = (await customersRes.json()) as ListAccessibleCustomersResponse;
		if (!customersRes.ok) {
			throw new Error(
				googleErrorMessage(
					'Google listAccessibleCustomers failed',
					customersBody,
					customersRes.status
				)
			);
		}

		const resourceName = customersBody.resourceNames?.[0];
		if (!resourceName) {
			throw new Error('Google listAccessibleCustomers returned no customers');
		}
		const customerId = resourceName.replace(/^customers\//, '');
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
		const until = utcToday();
		const query = [
			'SELECT segments.date, campaign.id, metrics.cost_micros, metrics.impressions, metrics.clicks',
			'FROM campaign',
			`WHERE segments.date BETWEEN '${p.since}' AND '${until}'`
		].join(' ');

		const streamUrl = `https://googleads.googleapis.com/${this.apiVersion}/customers/${stored.customerId}/googleAds:searchStream`;
		const res = await this.fetchFn(streamUrl, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${accessToken}`,
				'developer-token': this.config.developerToken,
				'content-type': 'application/json'
			},
			body: JSON.stringify({ query })
		});

		const body: unknown = await res.json();
		if (!res.ok) {
			const errBody =
				typeof body === 'object' && body !== null
					? (body as { error?: { message?: string } })
					: {};
			throw new Error(googleErrorMessage('Google searchStream failed', errBody, res.status));
		}

		const batches = this.normalizeStreamBatches(body);
		const out: NormalizedAdMetricRow[] = [];
		for (const batch of batches) {
			for (const row of batch.results ?? []) {
				const mapped = this.mapResultRow(row);
				if (mapped) out.push(mapped);
			}
		}
		return out;
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
		const body = (await res.json()) as GoogleTokenResponse;
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
			apiVersion: process.env.GOOGLE_ADS_API_VERSION?.trim() || DEFAULT_API_VERSION
		},
		fetchFn
	);
}
