/**
 * Yapılandırma yalnız env'den okunur ve süreç başında bir kez doğrulanır — eksik ayarla
 * ayağa kalkıp ilk mesajda 500 atmaktansa hiç başlamamak yeğdir.
 */

function required(name) {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Eksik zorunlu env: ${name}`);
	}
	return value;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * RELAY_SESSIONS — hangi WAHA oturumu hangi firmaya ait ve hangi secret'la imzalanacak:
 *
 *   {"default": {"tenantId": "uuid", "secret": "hex"}, "klinik-2": {...}}
 *
 * Eşleme burada duruyor çünkü WAHA firmayı bilmiyor; oturum adından firmaya geçen tek
 * yer burası. Eşlenmemiş oturum İLETİLMEZ — yanlış firmaya mesaj yazmaktansa reddetmek.
 */
export function parseSessions(raw) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error('RELAY_SESSIONS geçerli JSON değil');
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('RELAY_SESSIONS bir nesne olmalı: {"oturum": {"tenantId": "...", "secret": "..."}}');
	}
	const sessions = new Map();
	for (const [session, value] of Object.entries(parsed)) {
		if (value === null || typeof value !== 'object' || Array.isArray(value)) {
			throw new Error(`RELAY_SESSIONS["${session}"] bir nesne olmalı`);
		}
		const tenantId = typeof value.tenantId === 'string' ? value.tenantId.trim() : '';
		const secret = typeof value.secret === 'string' ? value.secret.trim() : '';
		if (!UUID_RE.test(tenantId)) {
			throw new Error(`RELAY_SESSIONS["${session}"].tenantId geçerli bir uuid değil`);
		}
		if (!secret) {
			throw new Error(`RELAY_SESSIONS["${session}"].secret boş`);
		}
		sessions.set(session, { tenantId, secret });
	}
	if (sessions.size === 0) {
		throw new Error('RELAY_SESSIONS boş — en az bir oturum eşlemesi gerekiyor');
	}
	return sessions;
}

export function loadConfig(env = process.env) {
	const webhookUrl = required('VERIMAYA_WEBHOOK_URL');
	let parsedUrl;
	try {
		parsedUrl = new URL(webhookUrl);
	} catch {
		throw new Error('VERIMAYA_WEBHOOK_URL geçerli bir URL değil');
	}
	return {
		port: Number(env.PORT?.trim() || 8080),
		webhookUrl: parsedUrl.toString(),
		inboundToken: required('RELAY_INBOUND_TOKEN'),
		sessions: parseSessions(required('RELAY_SESSIONS')),
		maxBodyBytes: Number(env.RELAY_MAX_BODY_BYTES?.trim() || 2 * 1024 * 1024),
		timeoutMs: Number(env.RELAY_TIMEOUT_MS?.trim() || 10_000)
	};
}
