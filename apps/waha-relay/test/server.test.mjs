import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractSession, handleRequest } from '../src/server.mjs';
import { parseSessions } from '../src/config.mjs';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

const CONFIG = {
	webhookUrl: 'https://api.example.test/v1/webhooks/waha',
	inboundToken: 'inbound-token',
	sessions: new Map([
		['default', { tenantId: TENANT_A, secret: 'secret-a' }],
		['klinik-2', { tenantId: TENANT_B, secret: 'secret-b' }]
	]),
	maxBodyBytes: 1024,
	timeoutMs: 1000
};

/** Gövdeyi tek parça gönderen sahte istek. */
function fakeRequest({ method = 'POST', url = '/', headers = {}, body = '' } = {}) {
	const listeners = new Map();
	return {
		method,
		url,
		headers,
		destroy() {},
		on(event, handler) {
			listeners.set(event, handler);
			if (event === 'error') {
				queueMicrotask(() => {
					listeners.get('data')?.(Buffer.from(body, 'utf8'));
					listeners.get('end')?.();
				});
			}
			return this;
		}
	};
}

function fakeResponse() {
	return {
		headersSent: false,
		statusCode: null,
		body: null,
		writeHead(status) {
			this.statusCode = status;
			this.headersSent = true;
		},
		end(payload) {
			this.body = payload ? JSON.parse(payload) : null;
		}
	};
}

test('geçersiz token 401 döner ve yukarı hiç istek gitmez', async () => {
	let called = false;
	const res = fakeResponse();
	await handleRequest(
		fakeRequest({ headers: { 'x-webhook-token': 'yanlis' }, body: '{}' }),
		res,
		CONFIG,
		async () => {
			called = true;
			return new Response('', { status: 202 });
		}
	);
	assert.equal(res.statusCode, 401);
	assert.equal(called, false, 'reddedilen istek yukarı iletilmemeli');
});

test('token başlığı hiç yoksa 401', async () => {
	const res = fakeResponse();
	await handleRequest(fakeRequest({ body: '{}' }), res, CONFIG, async () => {
		throw new Error('çağrılmamalı');
	});
	assert.equal(res.statusCode, 401);
});

test('eşlenmemiş oturum iletilmez', async () => {
	let called = false;
	const res = fakeResponse();
	await handleRequest(
		fakeRequest({
			headers: { 'x-webhook-token': 'inbound-token' },
			body: JSON.stringify({ session: 'bilinmeyen' })
		}),
		res,
		CONFIG,
		async () => {
			called = true;
			return new Response('', { status: 202 });
		}
	);
	assert.equal(res.statusCode, 404);
	assert.equal(called, false, 'yanlış firmaya yazmaktansa reddet');
});

test('doğru oturum kendi firmasının kimliğiyle iletilir ve gövde aynen gider', async () => {
	const body = JSON.stringify({ session: 'klinik-2', payload: { id: 'msg-1' } });
	let seen;
	const res = fakeResponse();
	await handleRequest(
		fakeRequest({ headers: { 'x-webhook-token': 'inbound-token' }, body }),
		res,
		CONFIG,
		async (url, init) => {
			seen = { url, init };
			return new Response('', { status: 202 });
		}
	);
	assert.equal(res.statusCode, 202);
	assert.equal(seen.url, CONFIG.webhookUrl);
	assert.equal(seen.init.headers['x-tenant-id'], TENANT_B);
	assert.match(seen.init.headers['x-webhook-signature'], /^v1=[0-9a-f]{64}$/);
	assert.equal(seen.init.body.toString('utf8'), body, 'gövde bayt bayt aynı gitmeli');
	const ts = Number(seen.init.headers['x-webhook-timestamp']);
	assert.ok(Math.abs(Math.floor(Date.now() / 1000) - ts) < 5, 'timestamp taze olmalı');
});

test('yukarıdan gelen durum kodu aynen döner', async () => {
	const res = fakeResponse();
	await handleRequest(
		fakeRequest({
			headers: { 'x-webhook-token': 'inbound-token' },
			body: JSON.stringify({ session: 'default' })
		}),
		res,
		CONFIG,
		async () => new Response('', { status: 401 })
	);
	assert.equal(res.statusCode, 401, 'WAHA yeniden deneme kararını buna göre veriyor');
});

test('yukarısı erişilemezse 502', async () => {
	const res = fakeResponse();
	await handleRequest(
		fakeRequest({
			headers: { 'x-webhook-token': 'inbound-token' },
			body: JSON.stringify({ session: 'default' })
		}),
		res,
		CONFIG,
		async () => {
			throw new Error('connect ECONNREFUSED');
		}
	);
	assert.equal(res.statusCode, 502);
});

test('bozuk JSON 400', async () => {
	const res = fakeResponse();
	await handleRequest(
		fakeRequest({ headers: { 'x-webhook-token': 'inbound-token' }, body: 'not-json' }),
		res,
		CONFIG,
		async () => {
			throw new Error('çağrılmamalı');
		}
	);
	assert.equal(res.statusCode, 400);
});

test('oturum alanı yoksa default kabul edilir', () => {
	assert.equal(extractSession({}), 'default');
	assert.equal(extractSession({ session: '  ' }), 'default');
	assert.equal(extractSession({ session: 'klinik-2' }), 'klinik-2');
});

test('RELAY_SESSIONS doğrulaması kötü değerleri reddeder', () => {
	assert.throws(() => parseSessions('{'), /geçerli JSON değil/);
	assert.throws(() => parseSessions('[]'), /nesne olmalı/);
	assert.throws(() => parseSessions('{}'), /boş/);
	assert.throws(() => parseSessions('{"a":{"tenantId":"x","secret":"s"}}'), /uuid değil/);
	assert.throws(
		() => parseSessions(`{"a":{"tenantId":"${TENANT_A}","secret":""}}`),
		/secret boş/
	);
	const ok = parseSessions(`{"a":{"tenantId":"${TENANT_A}","secret":"s"}}`);
	assert.equal(ok.get('a').tenantId, TENANT_A);
});
