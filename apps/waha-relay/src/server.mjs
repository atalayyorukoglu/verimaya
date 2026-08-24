import { createServer } from 'node:http';
import { loadConfig } from './config.mjs';
import { safeTokenEqual, signWebhookPayload } from './sign.mjs';

const PROVIDER = 'waha';
const INBOUND_TOKEN_HEADER = 'x-webhook-token';

/**
 * WAHA -> Verimaya imzalama aracı.
 *
 * Neden var: WAHA webhook'a yalnız SABİT başlık ekleyebiliyor; Verimaya ise her istekte
 * taze timestamp + `${ts}.waha.${tenantId}.${body}` üzerinden HMAC istiyor (WEBHOOK-01).
 * Aradaki fark burada kapanıyor. Gövde bayt bayt aynen iletilir — tek karakter değişse
 * imza tutmaz.
 *
 * Günlüğe mesaj İÇERİĞİ yazılmaz: bu bileşen ham hasta verisi görüyor (`pii-mask.ts`
 * kapısının önünde). Yalnız oturum, firma ve durum kodu loglanır.
 */

function log(fields) {
	process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...fields })}\n`);
}

function send(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'content-length': Buffer.byteLength(payload)
	});
	res.end(payload);
}

/** Gövdeyi Buffer olarak toplar; sınırı aşarsa bağlantıyı erken keser. */
function readBody(req, maxBytes) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on('data', (chunk) => {
			size += chunk.length;
			if (size > maxBytes) {
				reject(new Error('body_too_large'));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	});
}

/** WAHA oturum adını payload'dan çıkarır; alan yoksa WAHA'nın varsayılanı `default`. */
export function extractSession(payload) {
	if (payload && typeof payload === 'object' && typeof payload.session === 'string') {
		const trimmed = payload.session.trim();
		if (trimmed) return trimmed;
	}
	return 'default';
}

export async function handleRequest(req, res, config, fetchImpl = fetch) {
	if (req.method === 'GET' && req.url === '/healthz') {
		send(res, 200, { ok: true });
		return;
	}
	if (req.method !== 'POST') {
		send(res, 405, { error: 'method_not_allowed' });
		return;
	}

	const provided = req.headers[INBOUND_TOKEN_HEADER];
	if (typeof provided !== 'string' || !safeTokenEqual(provided, config.inboundToken)) {
		log({ event: 'rejected', reason: 'invalid_inbound_token' });
		send(res, 401, { error: 'invalid_inbound_token' });
		return;
	}

	let rawBody;
	try {
		rawBody = await readBody(req, config.maxBodyBytes);
	} catch (error) {
		const tooLarge = error instanceof Error && error.message === 'body_too_large';
		log({ event: 'rejected', reason: tooLarge ? 'body_too_large' : 'body_read_failed' });
		send(res, tooLarge ? 413 : 400, { error: tooLarge ? 'body_too_large' : 'bad_request' });
		return;
	}

	let payload;
	try {
		payload = JSON.parse(rawBody.toString('utf8'));
	} catch {
		log({ event: 'rejected', reason: 'invalid_json' });
		send(res, 400, { error: 'invalid_json' });
		return;
	}

	const session = extractSession(payload);
	const mapping = config.sessions.get(session);
	if (!mapping) {
		// Eşlenmemiş oturum iletilmez. Yeni bir firma eklendiğinde RELAY_SESSIONS
		// güncellenmemişse hatayı burada görmek, mesajın yanlış firmaya düşmesinden iyidir.
		log({ event: 'rejected', reason: 'unmapped_session', session });
		send(res, 404, { error: 'unmapped_session' });
		return;
	}

	const timestamp = Math.floor(Date.now() / 1000);
	const signature = signWebhookPayload(
		timestamp,
		PROVIDER,
		mapping.tenantId,
		rawBody.toString('utf8'),
		mapping.secret
	);

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), config.timeoutMs);
	try {
		const upstream = await fetchImpl(config.webhookUrl, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-tenant-id': mapping.tenantId,
				'x-webhook-timestamp': String(timestamp),
				'x-webhook-signature': signature
			},
			body: rawBody,
			signal: controller.signal
		});
		log({
			event: 'forwarded',
			session,
			tenantId: mapping.tenantId,
			status: upstream.status
		});
		// Yukarıdan gelen durumu aynen döndürüyoruz ki WAHA kendi yeniden deneme
		// mantığını doğru çalıştırsın (401/4xx'te tekrar denemesin, 5xx'te denesin).
		send(res, upstream.status, { forwarded: true, status: upstream.status });
	} catch (error) {
		const aborted = error instanceof Error && error.name === 'AbortError';
		log({
			event: 'forward_failed',
			session,
			tenantId: mapping.tenantId,
			reason: aborted ? 'timeout' : 'network_error'
		});
		send(res, 502, { error: aborted ? 'upstream_timeout' : 'upstream_unreachable' });
	} finally {
		clearTimeout(timer);
	}
}

export function createRelayServer(config, fetchImpl = fetch) {
	return createServer((req, res) => {
		handleRequest(req, res, config, fetchImpl).catch((error) => {
			log({ event: 'unhandled_error', reason: error?.message ?? 'unknown' });
			if (!res.headersSent) send(res, 500, { error: 'internal_error' });
		});
	});
}

// Doğrudan çalıştırıldığında sunucuyu aç; test dosyaları modülü import ederken açmaz.
if (import.meta.url === `file://${process.argv[1]}`) {
	const config = loadConfig();
	createRelayServer(config).listen(config.port, () => {
		log({ event: 'listening', port: config.port, sessions: [...config.sessions.keys()] });
	});
}
