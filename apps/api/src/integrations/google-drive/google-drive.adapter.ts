import { randomUUID } from 'node:crypto';
import type { DriveClientPort } from './drive.types';

export type GoogleDriveAdapterConfig = {
	clientId: string;
	clientSecret: string;
};

export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type GoogleTokenResponse = {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	error?: string;
	error_description?: string;
};

type DriveFile = { id?: string; name?: string };
type DriveFileList = { files?: DriveFile[] };

/**
 * `drive.file`: uygulama YALNIZ kendi oluşturduğu dosya/klasörleri görür ve
 * yönetir. Firmanın geri kalan Drive'ı bize kapalıdır — en dar scope budur ve
 * aynalama için yeterlidir (kök klasörü de biz açıyoruz).
 */
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

/** Erişim jetonu bir saat geçerli; süresi dolmadan 60 sn önce yenilenir. */
const ACCESS_TOKEN_SKEW_MS = 60_000;

function formBody(params: Record<string, string>): string {
	return new URLSearchParams(params).toString();
}

function errorMessage(prefix: string, body: unknown, status: number): string {
	if (typeof body === 'object' && body !== null) {
		const b = body as {
			error?: string | { message?: string; status?: string };
			error_description?: string;
		};
		if (typeof b.error === 'string') {
			return `${prefix}: ${b.error_description?.trim() || b.error} (HTTP ${status})`;
		}
		const detail = b.error?.message?.trim() || b.error?.status?.trim();
		if (detail) return `${prefix}: ${detail} (HTTP ${status})`;
	}
	return `${prefix} (HTTP ${status})`;
}

async function readJson<T>(res: Response, label: string): Promise<T> {
	const text = await res.text();
	if (!text.trim()) return {} as T;
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new Error(`${label}: non-JSON response (HTTP ${res.status})`);
	}
}

/** Drive `q` parametresinde tek tırnak kaçışı. */
function escapeQueryValue(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * DRIVE-01 — Google Drive v3 adaptörü (OAuth offline + multipart upload).
 * Testlerde `fetchFn` enjekte edilir; üretimde `globalThis.fetch`.
 */
export class GoogleDriveAdapter implements DriveClientPort {
	private readonly fetchFn: FetchFn;
	/** refreshToken → kısa ömürlü erişim jetonu (süreç ömrü; Redis'e gerek yok). */
	private readonly accessTokens = new Map<string, { token: string; expiresAt: number }>();

	constructor(
		private readonly config: GoogleDriveAdapterConfig,
		fetchFn: FetchFn = globalThis.fetch.bind(globalThis)
	) {
		this.fetchFn = fetchFn;
	}

	buildAuthorizeUrl(p: { state: string; redirectUri: string }): string {
		const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
		url.searchParams.set('client_id', this.config.clientId);
		url.searchParams.set('redirect_uri', p.redirectUri);
		url.searchParams.set('state', p.state);
		url.searchParams.set('response_type', 'code');
		// offline + consent: refresh_token yalnız ilk onayda gelir; `consent`
		// olmadan ikinci bağlanışta token'sız dönüp bağlantı sessizce bozuluyor.
		url.searchParams.set('access_type', 'offline');
		url.searchParams.set('prompt', 'consent');
		url.searchParams.set('scope', DRIVE_FILE_SCOPE);
		return url.toString();
	}

	async exchangeCode(p: {
		code: string;
		redirectUri: string;
	}): Promise<{ refreshToken: string; email: string | null }> {
		const res = await this.fetchFn(TOKEN_URL, {
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
		const body = await readJson<GoogleTokenResponse>(res, 'Google Drive token exchange failed');
		if (!res.ok || !body.refresh_token) {
			throw new Error(errorMessage('Google Drive token exchange failed', body, res.status));
		}
		const email = body.access_token ? await this.emailWithAccessToken(body.access_token) : null;
		return { refreshToken: body.refresh_token, email };
	}

	async accountEmail(p: { refreshToken: string }): Promise<string | null> {
		const accessToken = await this.accessToken(p.refreshToken);
		return this.emailWithAccessToken(accessToken);
	}

	async ensureFolder(p: {
		refreshToken: string;
		name: string;
		parentId: string | null;
	}): Promise<string> {
		const accessToken = await this.accessToken(p.refreshToken);
		const parent = p.parentId ?? 'root';
		const existing = await this.findFolder(accessToken, p.name, parent);
		if (existing) return existing;

		const res = await this.fetchFn(`${API_BASE}/files?fields=id`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${accessToken}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({ name: p.name, mimeType: FOLDER_MIME, parents: [parent] })
		});
		const body = await readJson<DriveFile>(res, 'Google Drive folder create failed');
		if (!res.ok || !body.id) {
			throw new Error(errorMessage('Google Drive folder create failed', body, res.status));
		}
		return body.id;
	}

	async folderExists(p: { refreshToken: string; folderId: string }): Promise<boolean> {
		const accessToken = await this.accessToken(p.refreshToken);
		const res = await this.fetchFn(
			`${API_BASE}/files/${encodeURIComponent(p.folderId)}?fields=id,trashed`,
			{ method: 'GET', headers: { authorization: `Bearer ${accessToken}` } }
		);
		if (res.status === 404) return false;
		const body = await readJson<{ id?: string; trashed?: boolean }>(
			res,
			'Google Drive folder get failed'
		);
		if (!res.ok) {
			throw new Error(errorMessage('Google Drive folder get failed', body, res.status));
		}
		return Boolean(body.id) && body.trashed !== true;
	}

	async uploadFile(p: {
		refreshToken: string;
		parentId: string;
		name: string;
		mimeType: string;
		body: Buffer;
	}): Promise<{ id: string }> {
		const accessToken = await this.accessToken(p.refreshToken);
		const boundary = `verimaya-${randomUUID()}`;
		const metadata = JSON.stringify({ name: p.name, parents: [p.parentId] });
		const head = Buffer.from(
			`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
				`--${boundary}\r\ncontent-type: ${p.mimeType}\r\n\r\n`,
			'utf8'
		);
		const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
		const payload = Buffer.concat([head, p.body, tail]);

		const res = await this.fetchFn(`${UPLOAD_BASE}/files?uploadType=multipart&fields=id`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${accessToken}`,
				'content-type': `multipart/related; boundary=${boundary}`
			},
			body: payload
		});
		const body = await readJson<DriveFile>(res, 'Google Drive upload failed');
		if (!res.ok || !body.id) {
			throw new Error(errorMessage('Google Drive upload failed', body, res.status));
		}
		return { id: body.id };
	}

	async deleteFile(p: { refreshToken: string; fileId: string }): Promise<void> {
		const accessToken = await this.accessToken(p.refreshToken);
		const res = await this.fetchFn(`${API_BASE}/files/${encodeURIComponent(p.fileId)}`, {
			method: 'DELETE',
			headers: { authorization: `Bearer ${accessToken}` }
		});
		// Zaten yoksa iş bitmiş sayılır — KVKK silmesi tekrar koşabilmeli.
		if (res.ok || res.status === 404) return;
		const body = await readJson<unknown>(res, 'Google Drive delete failed');
		throw new Error(errorMessage('Google Drive delete failed', body, res.status));
	}

	async moveFile(p: {
		refreshToken: string;
		fileId: string;
		fromParentId: string;
		toParentId: string;
	}): Promise<void> {
		const accessToken = await this.accessToken(p.refreshToken);
		const url = new URL(`${API_BASE}/files/${encodeURIComponent(p.fileId)}`);
		url.searchParams.set('addParents', p.toParentId);
		url.searchParams.set('removeParents', p.fromParentId);
		url.searchParams.set('fields', 'id');
		const res = await this.fetchFn(url.toString(), {
			method: 'PATCH',
			headers: {
				authorization: `Bearer ${accessToken}`,
				'content-type': 'application/json'
			},
			body: '{}'
		});
		if (res.ok) return;
		const body = await readJson<unknown>(res, 'Google Drive move failed');
		throw new Error(errorMessage('Google Drive move failed', body, res.status));
	}

	private async findFolder(
		accessToken: string,
		name: string,
		parentId: string
	): Promise<string | null> {
		const q = [
			`name = '${escapeQueryValue(name)}'`,
			`mimeType = '${FOLDER_MIME}'`,
			`'${escapeQueryValue(parentId)}' in parents`,
			'trashed = false'
		].join(' and ');
		const url = new URL(`${API_BASE}/files`);
		url.searchParams.set('q', q);
		url.searchParams.set('fields', 'files(id,name)');
		url.searchParams.set('pageSize', '10');
		const res = await this.fetchFn(url.toString(), {
			method: 'GET',
			headers: { authorization: `Bearer ${accessToken}` }
		});
		const body = await readJson<DriveFileList>(res, 'Google Drive folder search failed');
		if (!res.ok) {
			throw new Error(errorMessage('Google Drive folder search failed', body, res.status));
		}
		return body.files?.find((f) => f.id)?.id ?? null;
	}

	/**
	 * `about.get` `drive.file` scope'uyla da çalışır; yine de e-posta yalnız
	 * gösterim içindir — alınamazsa bağlantı bozulmuş sayılmaz.
	 */
	private async emailWithAccessToken(accessToken: string): Promise<string | null> {
		try {
			const res = await this.fetchFn(`${API_BASE}/about?fields=user(emailAddress)`, {
				method: 'GET',
				headers: { authorization: `Bearer ${accessToken}` }
			});
			if (!res.ok) return null;
			const body = await readJson<{ user?: { emailAddress?: string } }>(res, 'Drive about');
			return body.user?.emailAddress ?? null;
		} catch {
			return null;
		}
	}

	private async accessToken(refreshToken: string): Promise<string> {
		const cached = this.accessTokens.get(refreshToken);
		if (cached && cached.expiresAt > Date.now() + ACCESS_TOKEN_SKEW_MS) {
			return cached.token;
		}
		const res = await this.fetchFn(TOKEN_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: formBody({
				grant_type: 'refresh_token',
				refresh_token: refreshToken,
				client_id: this.config.clientId,
				client_secret: this.config.clientSecret
			})
		});
		const body = await readJson<GoogleTokenResponse>(res, 'Google Drive token refresh failed');
		if (!res.ok || !body.access_token) {
			throw new Error(errorMessage('Google Drive token refresh failed', body, res.status));
		}
		const ttlMs = (body.expires_in ?? 3600) * 1000;
		this.accessTokens.set(refreshToken, {
			token: body.access_token,
			expiresAt: Date.now() + ttlMs
		});
		return body.access_token;
	}
}

/**
 * Drive istemcisi kendi OAuth istemcisini kullanır; tanımlı değilse Google Ads
 * istemcisine düşer (aynı Google Cloud projesinde tek OAuth istemcisi yeterli —
 * onay ekranına Drive scope'u ve yönlendirme adresi eklenmesi şartıyla).
 */
export function googleDriveAdapterFromEnv(fetchFn?: FetchFn): GoogleDriveAdapter {
	return new GoogleDriveAdapter(
		{
			clientId:
				process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() ||
				process.env.GOOGLE_ADS_CLIENT_ID?.trim() ||
				'',
			clientSecret:
				process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() ||
				process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() ||
				''
		},
		fetchFn
	);
}

/** `<base>/v1/settings/drive/callback` — Google Cloud'a bu adres yazılır. */
export function driveRedirectUri(): string {
	const base = (
		process.env.OAUTH_REDIRECT_BASE?.trim() ||
		process.env.ADS_OAUTH_REDIRECT_BASE?.trim() ||
		'http://localhost:3000'
	).replace(/\/$/, '');
	return `${base}/v1/settings/drive/callback`;
}
