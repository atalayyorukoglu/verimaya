import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { buildSignedPayload, safeTokenEqual, signWebhookPayload } from '../src/sign.mjs';

const API_IDENTITY_FILE = fileURLToPath(
	new URL('../../api/src/webhooks/webhooks.identity.ts', import.meta.url)
);

test('imzalanan metin API kanonuyla aynı sırada', () => {
	assert.equal(buildSignedPayload(1700000000, 'waha', 'tenant-1', '{"a":1}'), '1700000000.waha.tenant-1.{"a":1}');
});

test('API tarafındaki kanon değişmemiş', () => {
	// Bu aracın tek işi API'nin beklediği imzayı üretmek. API kanonu değişirse bu test
	// kırmızıya döner ve sebebi burada yazar — sessizce 401 almaktansa testte görmek.
	const source = readFileSync(API_IDENTITY_FILE, 'utf8');
	assert.ok(
		source.includes('return `${timestamp}.${provider}.${claimedTenantId}.${rawBody}`;'),
		'API buildSignedPayload kanonu değişmiş — apps/waha-relay/src/sign.mjs güncellenmeli'
	);
});

test('imza v1= önekiyle ve hex olarak yazılıyor', () => {
	const ts = 1700000000;
	const body = '{"session":"default","payload":{"id":"x"}}';
	const secret = 'test-secret';
	const expected = createHmac('sha256', secret)
		.update(`${ts}.waha.11111111-1111-4111-8111-111111111111.${body}`)
		.digest('hex');
	assert.equal(
		signWebhookPayload(ts, 'waha', '11111111-1111-4111-8111-111111111111', body, secret),
		`v1=${expected}`
	);
});

test('farklı firma için üretilen imza başka firmada tutmaz', () => {
	const ts = 1700000000;
	const body = '{"a":1}';
	const a = signWebhookPayload(ts, 'waha', '11111111-1111-4111-8111-111111111111', body, 's');
	const b = signWebhookPayload(ts, 'waha', '22222222-2222-4222-8222-222222222222', body, 's');
	assert.notEqual(a, b);
});

test('token karşılaştırma doğru ve yanlış değerleri ayırıyor', () => {
	assert.equal(safeTokenEqual('abc', 'abc'), true);
	assert.equal(safeTokenEqual('abc', 'abd'), false);
	assert.equal(safeTokenEqual('abc', 'abcdef'), false);
	assert.equal(safeTokenEqual('', 'abc'), false);
});
