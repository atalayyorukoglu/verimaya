import { describe, expect, it } from 'vitest';
import { GoogleDriveAdapter, type FetchFn } from './google-drive.adapter';

type Call = { url: string; init: RequestInit | undefined };

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

/** Sahte Google: gerçek ağ yok, yanıtlar sırayla verilir. */
function fakeFetch(responses: Array<(url: string) => Response>): {
	fetchFn: FetchFn;
	calls: Call[];
} {
	const calls: Call[] = [];
	let i = 0;
	const fetchFn: FetchFn = async (input, init) => {
		const url = String(input);
		calls.push({ url, init });
		const handler = responses[Math.min(i, responses.length - 1)];
		i++;
		return handler(url);
	};
	return { fetchFn, calls };
}

function adapter(fetchFn: FetchFn) {
	return new GoogleDriveAdapter({ clientId: 'cid', clientSecret: 'secret' }, fetchFn);
}

describe('DRIVE-01 Google Drive adaptörü', () => {
	it('onay adresi drive.file scope ve offline erişim ister', () => {
		const url = new URL(
			adapter(async () => jsonResponse({})).buildAuthorizeUrl({
				state: 'st',
				redirectUri: 'https://api.example.com/v1/settings/drive/callback'
			})
		);
		expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');
		expect(url.searchParams.get('access_type')).toBe('offline');
		expect(url.searchParams.get('prompt')).toBe('consent');
		expect(url.searchParams.get('state')).toBe('st');
	});

	it('code takasında refresh token ve e-posta döner', async () => {
		const { fetchFn } = fakeFetch([
			() => jsonResponse({ access_token: 'at', refresh_token: 'rt' }),
			() => jsonResponse({ user: { emailAddress: 'ops@klinik.com' } })
		]);
		const result = await adapter(fetchFn).exchangeCode({
			code: 'c',
			redirectUri: 'https://api.example.com/v1/settings/drive/callback'
		});
		expect(result).toEqual({ refreshToken: 'rt', email: 'ops@klinik.com' });
	});

	it('refresh token gelmezse hata — bağlantı sessizce bozulmasın', async () => {
		const { fetchFn } = fakeFetch([() => jsonResponse({ access_token: 'at' })]);
		await expect(
			adapter(fetchFn).exchangeCode({ code: 'c', redirectUri: 'https://x/cb' })
		).rejects.toThrow(/token exchange failed/i);
	});

	it('var olan klasörü yeniden açmaz', async () => {
		const { fetchFn, calls } = fakeFetch([
			() => jsonResponse({ access_token: 'at', expires_in: 3600 }),
			() => jsonResponse({ files: [{ id: 'folder-1', name: 'Ayse Yilmaz' }] })
		]);
		const id = await adapter(fetchFn).ensureFolder({
			refreshToken: 'rt',
			name: 'Ayse Yilmaz',
			parentId: 'root-1'
		});
		expect(id).toBe('folder-1');
		expect(calls.some((c) => c.init?.method === 'POST' && c.url.includes('/files?fields=id'))).toBe(
			false
		);
	});

	it('klasör yoksa açar ve kimliğini döner', async () => {
		const { fetchFn, calls } = fakeFetch([
			() => jsonResponse({ access_token: 'at', expires_in: 3600 }),
			() => jsonResponse({ files: [] }),
			() => jsonResponse({ id: 'folder-new' })
		]);
		const id = await adapter(fetchFn).ensureFolder({
			refreshToken: 'rt',
			name: 'Verimaya Hastalar',
			parentId: null
		});
		expect(id).toBe('folder-new');
		const create = calls.at(-1)!;
		expect(JSON.parse(String(create.init?.body))).toMatchObject({
			name: 'Verimaya Hastalar',
			mimeType: 'application/vnd.google-apps.folder',
			parents: ['root']
		});
	});

	it('multipart yükleme künye + baytı tek gövdede yollar', async () => {
		const { fetchFn, calls } = fakeFetch([
			() => jsonResponse({ access_token: 'at', expires_in: 3600 }),
			() => jsonResponse({ id: 'file-1' })
		]);
		const body = Buffer.from('sahte-jpeg-baytlari');
		const out = await adapter(fetchFn).uploadFile({
			refreshToken: 'rt',
			parentId: 'folder-1',
			name: '2026-09-15-1105-bilet.jpg',
			mimeType: 'image/jpeg',
			body
		});
		expect(out).toEqual({ id: 'file-1' });
		const upload = calls.at(-1)!;
		expect(upload.url).toContain('uploadType=multipart');
		const payload = Buffer.from(upload.init!.body as Buffer).toString('utf8');
		expect(payload).toContain('"name":"2026-09-15-1105-bilet.jpg"');
		expect(payload).toContain('"parents":["folder-1"]');
		expect(payload).toContain('sahte-jpeg-baytlari');
	});

	it('erişim jetonu önbelleklenir — ikinci çağrıda yeniden alınmaz', async () => {
		const { fetchFn, calls } = fakeFetch([
			() => jsonResponse({ access_token: 'at', expires_in: 3600 }),
			() => jsonResponse({ id: 'f', trashed: false })
		]);
		const client = adapter(fetchFn);
		await client.folderExists({ refreshToken: 'rt', folderId: 'f' });
		await client.folderExists({ refreshToken: 'rt', folderId: 'f' });
		const tokenCalls = calls.filter((c) => c.url.includes('oauth2.googleapis.com/token'));
		expect(tokenCalls).toHaveLength(1);
	});

	it('silinen dosyada 404 hata sayılmaz (KVKK silmesi tekrar koşabilmeli)', async () => {
		const { fetchFn } = fakeFetch([
			() => jsonResponse({ access_token: 'at', expires_in: 3600 }),
			() => new Response(null, { status: 404 })
		]);
		await expect(
			adapter(fetchFn).deleteFile({ refreshToken: 'rt', fileId: 'gone' })
		).resolves.toBeUndefined();
	});

	it('çöpe atılmış klasör "yok" sayılır', async () => {
		const { fetchFn } = fakeFetch([
			() => jsonResponse({ access_token: 'at', expires_in: 3600 }),
			() => jsonResponse({ id: 'f', trashed: true })
		]);
		await expect(
			adapter(fetchFn).folderExists({ refreshToken: 'rt', folderId: 'f' })
		).resolves.toBe(false);
	});

	it('taşıma addParents/removeParents ile yapılır', async () => {
		const { fetchFn, calls } = fakeFetch([
			() => jsonResponse({ access_token: 'at', expires_in: 3600 }),
			() => jsonResponse({ id: 'file-1' })
		]);
		await adapter(fetchFn).moveFile({
			refreshToken: 'rt',
			fileId: 'file-1',
			fromParentId: 'old',
			toParentId: 'new'
		});
		const move = calls.at(-1)!;
		expect(move.init?.method).toBe('PATCH');
		expect(move.url).toContain('addParents=new');
		expect(move.url).toContain('removeParents=old');
	});
});
