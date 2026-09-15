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

/**
 * Mesajın geldiği sohbet izinli mi? WAHA olayında sohbet kimliği `payload.from`
 * alanında durur (grup için `...@g.us`, birebir için `...@c.us`).
 *
 * Sohbet kimliği okunamıyorsa İLETİLMEZ: tanımadığımız bir olay şeklini
 * geçirmektense düşürmek yeğdir — filtrenin amacı tam olarak bu.
 */
export function isAllowedChat(payload, allowed) {
	const from = payload?.payload?.from ?? payload?.from;
	if (typeof from !== 'string' || !from.trim()) return false;
	return allowed.has(from.trim());
}

/**
 * WAHA-01 — ekin kendisini Verimaya'ya taşır.
 *
 * WAHA'nın verdiği adres WAHA'nın kendi bakış açısından (`localhost:3000`); iç ağda
 * relay oraya `WAHA_BASE_URL` ile ulaşır, yolu aynen kullanır. Dosya bayt olarak
 * alınır, base64 + künye JSON'a konur ve mesaj webhook'uyla AYNI kanonla imzalanır.
 * Mesaj zaten kabul edildi; ek iletimi başarısız olursa yalnız loglanır — mesaj
 * kaybolmaz, ek sonradan "Kişi bağlarını güncelle" gibi bir yolla değil, WAHA'nın
 * yeniden denemesiyle gelir (o yüzden 5xx döndürmüyoruz, WAHA mesajı tekrarlar).
 */
export async function forwardMedia(payload, mapping, config, fetchImpl = fetch) {
	const inner = payload?.payload;
	const mediaUrl = inner?.media?.url;
	const externalId = inner?.id;
	if (!config.wahaBaseUrl || !config.wahaApiKey) return { skipped: 'media_disabled' };
	if (typeof mediaUrl !== 'string' || !mediaUrl || typeof externalId !== 'string') {
		return { skipped: 'no_media_url' };
	}

	let source;
	try {
		const original = new URL(mediaUrl);
		source = `${config.wahaBaseUrl}${original.pathname}${original.search}`;
	} catch {
		return { skipped: 'invalid_media_url' };
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), config.mediaTimeoutMs);
	try {
		const download = await fetchImpl(source, {
			headers: { 'x-api-key': config.wahaApiKey },
			signal: controller.signal
		});
		if (!download.ok) {
			log({ event: 'media_download_failed', status: download.status });
			return { skipped: `download_${download.status}` };
		}
		const bytes = Buffer.from(await download.arrayBuffer());
		if (bytes.length === 0 || bytes.length > config.maxMediaBytes) {
			log({
				event: 'media_skipped',
				reason: bytes.length === 0 ? 'empty' : 'too_large',
				bytes: bytes.length
			});
			return { skipped: bytes.length === 0 ? 'empty' : 'too_large' };
		}

		const mimetype =
			(typeof inner.media?.mimetype === 'string' && inner.media.mimetype) ||
			download.headers?.get?.('content-type') ||
			'application/octet-stream';
		const filename =
			(typeof inner.media?.filename === 'string' && inner.media.filename) ||
			decodeURIComponent(new URL(source).pathname.split('/').pop() || '') ||
			null;
		const body = JSON.stringify({
			external_id: externalId,
			filename,
			mimetype,
			data_base64: bytes.toString('base64')
		});
		const timestamp = Math.floor(Date.now() / 1000);
		const signature = signWebhookPayload(
			timestamp,
			PROVIDER,
			mapping.tenantId,
			body,
			mapping.secret
		);
		const upstream = await fetchImpl(config.mediaWebhookUrl, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-tenant-id': mapping.tenantId,
				'x-webhook-timestamp': String(timestamp),
				'x-webhook-signature': signature
			},
			body,
			signal: controller.signal
		});
		log({
			event: 'media_forwarded',
			tenantId: mapping.tenantId,
			status: upstream.status,
			bytes: bytes.length
		});
		return { status: upstream.status, bytes: bytes.length };
	} catch (error) {
		const aborted = error instanceof Error && error.name === 'AbortError';
		log({ event: 'media_forward_failed', reason: aborted ? 'timeout' : 'network_error' });
		return { skipped: aborted ? 'timeout' : 'network_error' };
	} finally {
		clearTimeout(timer);
	}
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

	// Sohbet filtresi. WAHA bağlı numaranın BÜTÜN mesajlarını yollar; özel
	// yazışmalar da dahil. RELAY_ALLOWED_CHATS verilmişse yalnız o sohbetler
	// iletilir — geri kalanı sessizce düşer, Verimaya'ya hiç ulaşmaz.
	if (config.allowedChats && !isAllowedChat(payload, config.allowedChats)) {
		log({ event: 'skipped', reason: 'chat_not_allowed' });
		send(res, 202, { ok: true, skipped: 'chat_not_allowed' });
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
		// Mesaj kabul edildiyse ve ek varsa ekin kendisi de gider (WAHA-01).
		let media;
		if (upstream.status >= 200 && upstream.status < 300 && payload?.payload?.hasMedia === true) {
			media = await forwardMedia(payload, mapping, config, fetchImpl);
		}
		// Yukarıdan gelen durumu aynen döndürüyoruz ki WAHA kendi yeniden deneme
		// mantığını doğru çalıştırsın (401/4xx'te tekrar denemesin, 5xx'te denesin).
		send(res, upstream.status, { forwarded: true, status: upstream.status, media });
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
