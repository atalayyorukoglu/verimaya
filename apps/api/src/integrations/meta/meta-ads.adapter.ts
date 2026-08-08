import type { AdsProviderAdapter, NormalizedAdMetricRow } from '../ads/ads.types';
import { parseAdsCurrency } from '../ads/ads-currency';

export type MetaAdsAdapterConfig = {
	appId: string;
	appSecret: string;
	apiVersion?: string;
};

export type FetchFn = (
	input: string | URL | Request,
	init?: RequestInit
) => Promise<Response>;

type MetaTokenResponse = {
	access_token?: string;
	error?: { message?: string; type?: string; code?: number };
};

type MetaAdAccountsResponse = {
	data?: Array<{ account_id?: string; id?: string }>;
	error?: { message?: string; type?: string; code?: number };
};

type MetaInsightRow = {
	spend?: string;
	impressions?: string;
	clicks?: string;
	campaign_id?: string;
	date_start?: string;
	account_currency?: string;
};

type MetaAdAccountResponse = {
	currency?: string;
	error?: { message?: string; type?: string; code?: number };
};

type MetaInsightsResponse = {
	data?: MetaInsightRow[];
	paging?: { next?: string };
	error?: { message?: string; type?: string; code?: number };
};

type MetaStoredSecret = {
	accessToken: string;
	adAccountId: string;
};

const DEFAULT_API_VERSION = 'v21.0';
const MAX_INSIGHT_PAGES = 50;

function utcToday(): string {
	return new Date().toISOString().slice(0, 10);
}

function metaErrorMessage(prefix: string, body: { error?: { message?: string } }, status: number): string {
	const detail = body.error?.message?.trim();
	return detail ? `${prefix}: ${detail}` : `${prefix} (HTTP ${status})`;
}

/**
 * Meta Marketing API adapter (OAuth + campaign insights).
 * Inject fetchFn in tests; production uses globalThis.fetch.
 */
export class MetaAdsAdapter implements AdsProviderAdapter {
	readonly provider = 'meta' as const;
	private readonly apiVersion: string;
	private readonly fetchFn: FetchFn;

	constructor(
		private readonly config: MetaAdsAdapterConfig,
		fetchFn: FetchFn = globalThis.fetch.bind(globalThis)
	) {
		this.apiVersion = config.apiVersion?.trim() || DEFAULT_API_VERSION;
		this.fetchFn = fetchFn;
	}

	buildAuthorizeUrl(p: { state: string; redirectUri: string }): string {
		const url = new URL(`https://www.facebook.com/${this.apiVersion}/dialog/oauth`);
		url.searchParams.set('client_id', this.config.appId);
		url.searchParams.set('redirect_uri', p.redirectUri);
		url.searchParams.set('state', p.state);
		url.searchParams.set('scope', 'ads_read');
		url.searchParams.set('response_type', 'code');
		return url.toString();
	}

	async exchangeCode(p: { code: string; redirectUri: string }): Promise<{ secret: string }> {
		const tokenUrl = new URL(`https://graph.facebook.com/${this.apiVersion}/oauth/access_token`);
		tokenUrl.searchParams.set('client_id', this.config.appId);
		tokenUrl.searchParams.set('client_secret', this.config.appSecret);
		tokenUrl.searchParams.set('redirect_uri', p.redirectUri);
		tokenUrl.searchParams.set('code', p.code);

		const tokenRes = await this.fetchFn(tokenUrl.toString());
		const tokenBody = (await tokenRes.json()) as MetaTokenResponse;
		if (!tokenRes.ok || !tokenBody.access_token) {
			throw new Error(metaErrorMessage('Meta token exchange failed', tokenBody, tokenRes.status));
		}

		const accessToken = await this.exchangeLongLivedToken(tokenBody.access_token);

		const accountsUrl = new URL(`https://graph.facebook.com/${this.apiVersion}/me/adaccounts`);
		accountsUrl.searchParams.set('fields', 'account_id');
		accountsUrl.searchParams.set('access_token', accessToken);

		const accountsRes = await this.fetchFn(accountsUrl.toString());
		const accountsBody = (await accountsRes.json()) as MetaAdAccountsResponse;
		if (!accountsRes.ok) {
			throw new Error(
				metaErrorMessage('Meta ad accounts fetch failed', accountsBody, accountsRes.status)
			);
		}

		const adAccountId = accountsBody.data?.[0]?.account_id ?? accountsBody.data?.[0]?.id;
		if (!adAccountId) {
			throw new Error('Meta ad accounts response missing account_id');
		}

		const secret: MetaStoredSecret = {
			accessToken,
			adAccountId: String(adAccountId).replace(/^act_/, '')
		};
		return { secret: JSON.stringify(secret) };
	}

	/**
	 * Short-lived user tokens (~1–2h) → long-lived (~60d).
	 * On failure, keep the short-lived token so connect still succeeds.
	 */
	private async exchangeLongLivedToken(shortLived: string): Promise<string> {
		const url = new URL(`https://graph.facebook.com/${this.apiVersion}/oauth/access_token`);
		url.searchParams.set('grant_type', 'fb_exchange_token');
		url.searchParams.set('client_id', this.config.appId);
		url.searchParams.set('client_secret', this.config.appSecret);
		url.searchParams.set('fb_exchange_token', shortLived);

		try {
			const res = await this.fetchFn(url.toString());
			const body = (await res.json()) as MetaTokenResponse;
			if (res.ok && body.access_token) {
				return body.access_token;
			}
		} catch {
			/* fall through — reconnect UX covers expiry */
		}
		return shortLived;
	}

	async pullDailyMetrics(p: { secret: string; since: string }): Promise<NormalizedAdMetricRow[]> {
		const stored = this.parseSecret(p.secret);
		const until = utcToday();
		const accountId = stored.adAccountId.replace(/^act_/, '');
		const currency = await this.fetchAccountCurrency(stored.accessToken, accountId);

		let nextUrl: string | null = (() => {
			const url = new URL(
				`https://graph.facebook.com/${this.apiVersion}/act_${accountId}/insights`
			);
			url.searchParams.set('level', 'campaign');
			url.searchParams.set('time_increment', '1');
			url.searchParams.set('fields', 'spend,impressions,clicks,campaign_id,date_start');
			url.searchParams.set('since', p.since);
			url.searchParams.set('until', until);
			url.searchParams.set('access_token', stored.accessToken);
			return url.toString();
		})();

		const out: NormalizedAdMetricRow[] = [];
		let pages = 0;

		while (nextUrl && pages < MAX_INSIGHT_PAGES) {
			pages += 1;
			const res = await this.fetchFn(nextUrl);
			const body = (await res.json()) as MetaInsightsResponse;
			if (!res.ok) {
				throw new Error(metaErrorMessage('Meta insights fetch failed', body, res.status));
			}

			for (const row of body.data ?? []) {
				const mapped = this.mapInsightRow(row, currency);
				if (mapped) out.push(mapped);
			}

			nextUrl = body.paging?.next ?? null;
		}

		return out;
	}

	/** Ad account currency from Meta — never defaulted. */
	private async fetchAccountCurrency(accessToken: string, accountId: string): Promise<string> {
		const url = new URL(`https://graph.facebook.com/${this.apiVersion}/act_${accountId}`);
		url.searchParams.set('fields', 'currency');
		url.searchParams.set('access_token', accessToken);
		const res = await this.fetchFn(url.toString());
		const body = (await res.json()) as MetaAdAccountResponse;
		if (!res.ok) {
			throw new Error(metaErrorMessage('Meta ad account currency failed', body, res.status));
		}
		return parseAdsCurrency(body.currency, `Meta act_${accountId}`);
	}

	private parseSecret(secret: string): MetaStoredSecret {
		let parsed: unknown;
		try {
			parsed = JSON.parse(secret);
		} catch {
			throw new Error('Meta credential secret is not valid JSON');
		}
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			typeof (parsed as MetaStoredSecret).accessToken !== 'string' ||
			typeof (parsed as MetaStoredSecret).adAccountId !== 'string'
		) {
			throw new Error('Meta credential secret missing accessToken or adAccountId');
		}
		return parsed as MetaStoredSecret;
	}

	private mapInsightRow(row: MetaInsightRow, currency: string): NormalizedAdMetricRow | null {
		if (!row.campaign_id || !row.date_start) return null;
		const spendMajor = Number.parseFloat(row.spend ?? '0');
		const impressions = Number.parseInt(row.impressions ?? '0', 10);
		const clicks = Number.parseInt(row.clicks ?? '0', 10);
		return {
			provider: 'meta',
			date: row.date_start,
			campaignId: row.campaign_id,
			spendMinor: Number.isFinite(spendMajor) ? Math.round(spendMajor * 100) : 0,
			currency,
			impressions: Number.isFinite(impressions) ? impressions : 0,
			clicks: Number.isFinite(clicks) ? clicks : 0
		};
	}
}

export function metaAdsAdapterFromEnv(fetchFn?: FetchFn): MetaAdsAdapter {
	return new MetaAdsAdapter(
		{
			appId: process.env.META_APP_ID?.trim() ?? '',
			appSecret: process.env.META_APP_SECRET?.trim() ?? '',
			apiVersion: process.env.META_API_VERSION?.trim() || DEFAULT_API_VERSION
		},
		fetchFn
	);
}
