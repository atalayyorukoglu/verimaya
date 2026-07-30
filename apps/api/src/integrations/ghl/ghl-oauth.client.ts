/**
 * GHL Marketplace OAuth (authorization code + refresh).
 * @see https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/
 */

export type GhlUserType = 'Location' | 'Company';

export type GhlOAuthConfig = {
	clientId: string;
	clientSecret: string;
	/** Space-separated scopes registered on the Marketplace app. */
	scopes: string;
	userType: GhlUserType;
	authorizeBaseUrl?: string;
	tokenUrl?: string;
};

export type FetchFn = (
	input: string | URL | Request,
	init?: RequestInit
) => Promise<Response>;

/** JSON stored in tenant_credentials (provider=ghl), AES-GCM ciphertext. */
export type GhlStoredSecret = {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	userType: GhlUserType;
	locationId: string | null;
	companyId: string | null;
	scope: string | null;
};

type GhlTokenResponse = {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	token_type?: string;
	scope?: string;
	userType?: string;
	locationId?: string;
	companyId?: string;
	error?: string;
	message?: string;
};

const DEFAULT_AUTHORIZE =
	'https://marketplace.gohighlevel.com/oauth/chooselocation';
const DEFAULT_TOKEN = 'https://services.leadconnectorhq.com/oauth/token';

/** Minimal scopes for contact/opportunity sync (Adım 41+). Override via GHL_OAUTH_SCOPES. */
export const DEFAULT_GHL_SCOPES = [
	'contacts.readonly',
	'contacts.write',
	'opportunities.readonly',
	'opportunities.write'
].join(' ');

function formBody(params: Record<string, string>): string {
	return new URLSearchParams(params).toString();
}

function tokenErrorMessage(body: GhlTokenResponse, status: number): string {
	const detail = body.error?.trim() || body.message?.trim();
	return detail ? `GHL token exchange failed: ${detail}` : `GHL token exchange failed (HTTP ${status})`;
}

function parseUserType(raw: string | undefined, fallback: GhlUserType): GhlUserType {
	if (raw === 'Location' || raw === 'Company') return raw;
	return fallback;
}

/**
 * Builds authorize URL and exchanges codes/refresh tokens. Inject fetchFn in tests.
 */
export class GhlOAuthClient {
	private readonly authorizeBaseUrl: string;
	private readonly tokenUrl: string;
	private readonly fetchFn: FetchFn;

	constructor(
		private readonly config: GhlOAuthConfig,
		fetchFn: FetchFn = globalThis.fetch.bind(globalThis)
	) {
		this.authorizeBaseUrl = config.authorizeBaseUrl?.trim() || DEFAULT_AUTHORIZE;
		this.tokenUrl = config.tokenUrl?.trim() || DEFAULT_TOKEN;
		this.fetchFn = fetchFn;
	}

	buildAuthorizeUrl(p: { state: string; redirectUri: string }): string {
		const url = new URL(this.authorizeBaseUrl);
		url.searchParams.set('response_type', 'code');
		url.searchParams.set('redirect_uri', p.redirectUri);
		url.searchParams.set('client_id', this.config.clientId);
		url.searchParams.set('scope', this.config.scopes);
		url.searchParams.set('state', p.state);
		return url.toString();
	}

	async exchangeCode(p: { code: string; redirectUri: string }): Promise<{ secret: string }> {
		const stored = await this.requestToken({
			grant_type: 'authorization_code',
			code: p.code,
			redirect_uri: p.redirectUri,
			client_id: this.config.clientId,
			client_secret: this.config.clientSecret,
			user_type: this.config.userType
		});
		return { secret: JSON.stringify(stored) };
	}

	/**
	 * Refresh rotates both access and refresh tokens — caller must persist the new secret.
	 */
	async refresh(secretJson: string): Promise<{ secret: string }> {
		const current = parseGhlStoredSecret(secretJson);
		const stored = await this.requestToken({
			grant_type: 'refresh_token',
			refresh_token: current.refreshToken,
			client_id: this.config.clientId,
			client_secret: this.config.clientSecret,
			user_type: current.userType,
			redirect_uri: '' // omitted below if empty
		});
		// Preserve location/company if refresh response omits them
		if (!stored.locationId && current.locationId) stored.locationId = current.locationId;
		if (!stored.companyId && current.companyId) stored.companyId = current.companyId;
		return { secret: JSON.stringify(stored) };
	}

	private async requestToken(params: Record<string, string>): Promise<GhlStoredSecret> {
		const bodyParams = { ...params };
		if (!bodyParams.redirect_uri) {
			delete bodyParams.redirect_uri;
		}

		const res = await this.fetchFn(this.tokenUrl, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: formBody(bodyParams)
		});
		const body = (await res.json()) as GhlTokenResponse;
		if (!res.ok || !body.access_token || !body.refresh_token) {
			throw new Error(tokenErrorMessage(body, res.status));
		}

		const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 86_400;
		return {
			accessToken: body.access_token,
			refreshToken: body.refresh_token,
			expiresAt: Date.now() + expiresIn * 1000,
			userType: parseUserType(body.userType, this.config.userType),
			locationId: body.locationId?.trim() || null,
			companyId: body.companyId?.trim() || null,
			scope: body.scope?.trim() || null
		};
	}
}

export function parseGhlStoredSecret(secret: string): GhlStoredSecret {
	let parsed: unknown;
	try {
		parsed = JSON.parse(secret);
	} catch {
		throw new Error('GHL credential secret is not valid JSON');
	}
	if (
		typeof parsed !== 'object' ||
		parsed === null ||
		typeof (parsed as GhlStoredSecret).accessToken !== 'string' ||
		typeof (parsed as GhlStoredSecret).refreshToken !== 'string' ||
		typeof (parsed as GhlStoredSecret).expiresAt !== 'number' ||
		((parsed as GhlStoredSecret).userType !== 'Location' &&
			(parsed as GhlStoredSecret).userType !== 'Company')
	) {
		throw new Error('GHL credential secret missing required fields');
	}
	const s = parsed as GhlStoredSecret;
	return {
		accessToken: s.accessToken,
		refreshToken: s.refreshToken,
		expiresAt: s.expiresAt,
		userType: s.userType,
		locationId: typeof s.locationId === 'string' ? s.locationId : null,
		companyId: typeof s.companyId === 'string' ? s.companyId : null,
		scope: typeof s.scope === 'string' ? s.scope : null
	};
}

export function ghlOAuthClientFromEnv(fetchFn?: FetchFn): GhlOAuthClient {
	const userTypeRaw = process.env.GHL_USER_TYPE?.trim();
	const userType: GhlUserType =
		userTypeRaw === 'Company' ? 'Company' : 'Location';

	return new GhlOAuthClient(
		{
			clientId: process.env.GHL_CLIENT_ID?.trim() ?? '',
			clientSecret: process.env.GHL_CLIENT_SECRET?.trim() ?? '',
			scopes: process.env.GHL_OAUTH_SCOPES?.trim() || DEFAULT_GHL_SCOPES,
			userType,
			authorizeBaseUrl: process.env.GHL_OAUTH_AUTHORIZE_URL?.trim(),
			tokenUrl: process.env.GHL_OAUTH_TOKEN_URL?.trim()
		},
		fetchFn
	);
}
