#!/usr/bin/env node
/**
 * WEBHOOK-01 — tenant webhook kimliği: durum raporu + sağlama.
 *
 * Shim (`WEBHOOK_IDENTITY_DEFAULT_SECRET=true`) kapatılmadan önce HER aktif tenant'ın
 * `tenant_provider_identities` satırı olmalı; yoksa o tenant'ın webhook'ları 401 döner.
 * Bu script iki işi yapar:
 *
 *   status   Hangi tenant'ta hangi provider için satır var/yok — shim kapatmaya hazır mı?
 *   issue    Yeni secret üretir, hash'ler, şifreler ve satırı yazar (elle SQL yerine).
 *
 * Kullanım:
 *   pnpm --filter @verimaya/api webhook:identity status
 *   pnpm --filter @verimaya/api webhook:identity status --provider waha
 *   pnpm --filter @verimaya/api webhook:identity issue --tenant <uuid> --provider waha
 *   pnpm --filter @verimaya/api webhook:identity issue --tenant <uuid> --provider waha --rotate
 *
 * Env:
 *   DATABASE_URL                 Owner Postgres (db:migrate ile aynı)
 *   CREDENTIALS_ENCRYPTION_KEY   64 hex karakter (32 bayt) — AES-256-GCM
 *
 * Çıkış kodları:
 *   0  status: tüm tenant'lar hazır · issue: satır yazıldı
 *   2  status: en az bir tenant'ta kimlik eksik (shim KAPATILAMAZ)
 *   1  hata (env eksik, DB, geçersiz argüman, mevcut satır --rotate'suz)
 *
 * NOT: Üretilen secret yalnız bir kez ekrana basılır — veritabanında yalnız şifreli
 * hâli ve sha256 hash'i durur. Sağlayıcıya (WAHA vb.) aynı değeri vermen gerekir.
 */

const path = require('node:path');
const { createHash, createCipheriv, randomBytes } = require('node:crypto');
const { config: loadEnv } = require('dotenv');
const postgres = require('postgres');

loadEnv({ path: path.join(__dirname, '..', '.env') });

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/** apps/api/src/webhooks/webhooks.identity.ts → hashWebhookSecret ile birebir aynı. */
function hashWebhookSecret(secret) {
	return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** apps/api/src/common/crypto.service.ts → encrypt ile birebir aynı düzen: iv | authTag | ciphertext. */
function encryptSecret(plaintext, keyHex) {
	const key = Buffer.from(keyHex, 'hex');
	if (key.length !== 32) {
		throw new Error(
			`CREDENTIALS_ENCRYPTION_KEY 32 bayt (64 hex karakter) olmalı — şu an ${key.length} bayt`
		);
	}
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

function parseArgs(argv) {
	const out = { command: argv[0], flags: {} };
	for (let i = 1; i < argv.length; i += 1) {
		const token = argv[i];
		if (!token.startsWith('--')) continue;
		const name = token.slice(2);
		const next = argv[i + 1];
		if (next && !next.startsWith('--')) {
			out.flags[name] = next;
			i += 1;
		} else {
			out.flags[name] = true;
		}
	}
	return out;
}

async function commandStatus(sql, providerFilter) {
	const rows = await sql`
		select
			t.id,
			t.name,
			t.deleted_at,
			coalesce(
				array_agg(i.provider order by i.provider) filter (where i.provider is not null),
				'{}'
			) as providers
		from tenants t
		left join tenant_provider_identities i on i.tenant_id = t.id
		group by t.id, t.name, t.deleted_at
		order by t.deleted_at nulls first, t.name
	`;

	const active = rows.filter((r) => r.deleted_at === null);
	const missing = [];

	console.log(`\nAktif tenant: ${active.length} (silinmiş ${rows.length - active.length} hariç)\n`);

	for (const row of active) {
		const providers = row.providers ?? [];
		const ok = providerFilter ? providers.includes(providerFilter) : providers.length > 0;
		if (!ok) missing.push(row);
		const label = providers.length > 0 ? providers.join(', ') : '—';
		console.log(`  ${ok ? '✅' : '❌'}  ${row.name}  [${row.id}]  →  ${label}`);
	}

	if (missing.length === 0) {
		console.log(
			`\n✅ Tüm aktif tenant'larda kimlik var${providerFilter ? ` (provider: ${providerFilter})` : ''}.` +
				`\n   Shim kapatılabilir: WEBHOOK_IDENTITY_DEFAULT_SECRET=false\n`
		);
		return 0;
	}

	console.log(
		`\n❌ ${missing.length} tenant'ta kimlik eksik — shim ŞU AN KAPATILAMAZ.` +
			`\n   Kapatırsan bu tenant'ların webhook'ları 401 döner.\n` +
			`\n   Eksikler için:\n`
	);
	for (const row of missing) {
		console.log(
			`     pnpm --filter @verimaya/api webhook:identity issue --tenant ${row.id} --provider ${providerFilter || 'waha'}`
		);
	}
	console.log('');
	return 2;
}

async function commandIssue(sql, flags) {
	const tenantId = flags.tenant;
	const provider = flags.provider;
	const rotate = flags.rotate === true;

	if (typeof tenantId !== 'string' || typeof provider !== 'string') {
		console.error('Kullanım: issue --tenant <uuid> --provider <waha|ghl|...> [--rotate]');
		return 1;
	}

	const keyHex = process.env.CREDENTIALS_ENCRYPTION_KEY;
	if (!keyHex) {
		console.error('CREDENTIALS_ENCRYPTION_KEY yok — şifreleme yapılamaz.');
		return 1;
	}

	const [tenant] = await sql`select id, name, deleted_at from tenants where id = ${tenantId}`;
	if (!tenant) {
		console.error(`Tenant bulunamadı: ${tenantId}`);
		return 1;
	}
	if (tenant.deleted_at !== null) {
		console.error(`Tenant silinmiş: ${tenant.name}. Silinmiş tenant'a kimlik yazılmaz.`);
		return 1;
	}

	const existing = await sql`
		select id from tenant_provider_identities
		where tenant_id = ${tenantId} and provider = ${provider}
	`;
	if (existing.length > 0 && !rotate) {
		console.error(
			`Bu tenant+provider için zaten kimlik var (${existing.length} satır).\n` +
				`Yenilemek istiyorsan --rotate ekle; eski satır silinmez, lookup en yeniyi alır.`
		);
		return 1;
	}

	const secret = randomBytes(32).toString('hex');
	const keyHash = hashWebhookSecret(secret);
	const ciphertext = encryptSecret(secret, keyHex);

	const [{ version }] = await sql`
		select coalesce(max(key_version), 0) + 1 as version
		from tenant_provider_identities
		where tenant_id = ${tenantId} and provider = ${provider}
	`;

	await sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
		await tx`
			insert into tenant_provider_identities
				(tenant_id, provider, ciphertext, key_hash, key_version)
			values
				(${tenantId}, ${provider}, ${ciphertext}, ${keyHash}, ${version})
		`;
	});

	console.log(`\n✅ Kimlik yazıldı — ${tenant.name} / ${provider} (key_version ${version})\n`);
	console.log('   Sağlayıcıya verilecek secret (BİR KEZ gösterilir, kaydet):\n');
	console.log(`     ${secret}\n`);
	console.log('   Veritabanında yalnız şifreli hâli ve sha256 hash tutulur.');
	console.log('   Bu değeri commit etme, mesajla paylaşma; sağlayıcı paneline elle gir.\n');
	return 0;
}

async function main() {
	const { command, flags } = parseArgs(process.argv.slice(2));

	if (!command || !['status', 'issue'].includes(command)) {
		console.error(
			'Kullanım:\n' +
				'  webhook:identity status [--provider <name>]\n' +
				'  webhook:identity issue --tenant <uuid> --provider <name> [--rotate]'
		);
		process.exit(1);
	}

	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error('DATABASE_URL yok.');
		process.exit(1);
	}

	const sql = postgres(url, { max: 1 });
	try {
		const code =
			command === 'status'
				? await commandStatus(sql, typeof flags.provider === 'string' ? flags.provider : null)
				: await commandIssue(sql, flags);
		process.exit(code);
	} finally {
		await sql.end({ timeout: 5 });
	}
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
