import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verimaya webhook imza kanonu — `apps/api/src/webhooks/webhooks.identity.ts`
 * (`buildSignedPayload`) ile birebir aynı olmak ZORUNDA. Orada değişirse burası da değişir;
 * `test/sign.test.mjs` bu eşitliği kanıtlar.
 *
 * İmzalanan metin: `${ts}.${provider}.${tenantId}.${rawBody}`
 */
export function buildSignedPayload(timestamp, provider, tenantId, rawBody) {
	return `${timestamp}.${provider}.${tenantId}.${rawBody}`;
}

/** Header'a yazılan biçim: `v1=<hex>` (API `parseWebhookSignatureHeader` ile okuyor). */
export function signWebhookPayload(timestamp, provider, tenantId, rawBody, secret) {
	const hex = createHmac('sha256', secret)
		.update(buildSignedPayload(timestamp, provider, tenantId, rawBody))
		.digest('hex');
	return `v1=${hex}`;
}

/**
 * Sabit zamanlı token karşılaştırma. Uzunluk farkı da sızdırmasın diye önce hash'lenir —
 * `timingSafeEqual` farklı uzunlukta atıyor ve o atış tek başına bilgi verir.
 */
export function safeTokenEqual(a, b) {
	const bufA = Buffer.from(createHmac('sha256', 'token-compare').update(a).digest());
	const bufB = Buffer.from(createHmac('sha256', 'token-compare').update(b).digest());
	return timingSafeEqual(bufA, bufB);
}
