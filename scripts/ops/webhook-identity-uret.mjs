/**
 * Webhook kimliği üretir (WEBHOOK-01, docs/DEPLOY-COOLIFY.md).
 *
 * `tenant_provider_identities` için ciphertext + key_hash hesaplar ve INSERT
 * cümlesini basar. Admin arayüzü yok; belge "elle SQL" diyor, bu betik o adımı
 * tekrarlanabilir hâle getiriyor.
 *
 * API konteynerinin İÇİNDE çalıştırılır — CREDENTIALS_ENCRYPTION_KEY oradan
 * okunur, dışarı çıkmaz. Secret argüman olarak verilir, ekrana basılmaz.
 *
 *   docker exec -i <api> node /tmp/webhook-identity-uret.mjs <tenant-uuid> <provider> <secret>
 */
import { createCipheriv, createHash, randomBytes } from 'node:crypto';

const [tenantId, provider, secret] = process.argv.slice(2);
if (!tenantId || !provider || !secret) {
	console.error('Kullanım: node webhook-identity-uret.mjs <tenant-uuid> <provider> <secret>');
	process.exit(1);
}

const raw = (process.env.CREDENTIALS_ENCRYPTION_KEY ?? '').trim();
const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
if (key.length !== 32) {
	console.error('CREDENTIALS_ENCRYPTION_KEY 32 bayt değil (hex ya da base64 olmalı)');
	process.exit(1);
}

const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);

const ciphertextHex = payload.toString('hex');
const keyHash = createHash('sha256').update(secret, 'utf8').digest('hex');

// Aynı sağlayıcı için satır varsa rotasyon: lookup `updated_at DESC` aldığı için
// yeni satır eskisini geçersiz kılar.
console.log(`SELECT set_config('app.current_tenant_id', '${tenantId}', true);
INSERT INTO tenant_provider_identities (tenant_id, provider, ciphertext, key_hash, key_version)
VALUES ('${tenantId}', '${provider}', '\\x${ciphertextHex}'::bytea, '${keyHash}', 1);`);
