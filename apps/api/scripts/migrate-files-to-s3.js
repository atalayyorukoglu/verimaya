#!/usr/bin/env node
/**
 * Migrate patient files from local:// disk keys to s3:// (Cloudflare R2 / S3).
 *
 * Default is dry-run (count + list only). Pass --apply to upload and update DB.
 * Local files are NOT deleted after upload — remove manually after verification.
 * Idempotent: a second --apply finds 0 local:// rows to migrate.
 *
 * Usage:
 *   pnpm --filter @verimaya/api files:migrate-s3
 *   pnpm --filter @verimaya/api files:migrate-s3 -- --apply
 *
 * Requires DATABASE_URL (owner / BYPASSRLS — not verimaya_app) plus S3_* env
 * and a readable UPLOAD_DIR for the local objects.
 */

const fs = require('node:fs');
const path = require('node:path');
const { config: loadEnv } = require('dotenv');
const postgres = require('postgres');
const {
	PutObjectCommand,
	HeadObjectCommand,
	S3Client
} = require('@aws-sdk/client-s3');

loadEnv({ path: path.join(__dirname, '..', '.env') });

const LOCAL_SCHEME = 'local://';
const S3_SCHEME = 's3://';
const DEFAULT_UPLOAD_DIR = '.data/uploads';

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
	/** @type {{ apply: boolean, help: boolean }} */
	const out = { apply: false, help: false };
	for (const arg of argv) {
		if (arg === '--') continue;
		if (arg === '--apply') out.apply = true;
		else if (arg === '--dry-run') out.apply = false;
		else if (arg === '--help' || arg === '-h') out.help = true;
	}
	return out;
}

function getUploadDir() {
	const raw = process.env.UPLOAD_DIR?.trim();
	return path.resolve(raw && raw.length > 0 ? raw : DEFAULT_UPLOAD_DIR);
}

/**
 * @param {string} storageKey
 * @returns {string | null}
 */
function resolveLocalFilePath(storageKey) {
	if (!storageKey.startsWith(LOCAL_SCHEME)) return null;
	const relative = storageKey.slice(LOCAL_SCHEME.length);
	if (!relative || relative === 'pending') return null;
	if (relative.includes('..') || path.isAbsolute(relative)) return null;

	const parts = relative.split('/').filter(Boolean);
	if (parts.length !== 3) return null;

	const root = getUploadDir();
	const absolute = path.resolve(root, ...parts);
	const relativeToRoot = path.relative(root, absolute);
	if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return null;
	return absolute;
}

/**
 * @param {string} storageKey
 * @returns {string | null}
 */
function localToS3Key(storageKey) {
	if (!storageKey.startsWith(LOCAL_SCHEME)) return null;
	const relative = storageKey.slice(LOCAL_SCHEME.length);
	if (!relative || relative === 'pending') return null;
	if (relative.includes('..')) return null;
	const parts = relative.split('/').filter(Boolean);
	if (parts.length !== 3) return null;
	return `${S3_SCHEME}${parts.join('/')}`;
}

/**
 * @param {string} s3Key
 * @returns {string | null}
 */
function resolveS3ObjectKey(s3Key) {
	if (!s3Key.startsWith(S3_SCHEME)) return null;
	const relative = s3Key.slice(S3_SCHEME.length);
	if (!relative || relative === 'pending' || relative.includes('..')) return null;
	const parts = relative.split('/').filter(Boolean);
	if (parts.length !== 3) return null;
	return parts.join('/');
}

function readS3Config() {
	const endpoint = process.env.S3_ENDPOINT?.trim();
	const bucket = process.env.S3_BUCKET?.trim();
	const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
	const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
	const region = process.env.S3_REGION?.trim() || 'auto';
	if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
		throw new Error(
			'Missing S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, or S3_SECRET_ACCESS_KEY'
		);
	}
	const forceRaw = process.env.S3_FORCE_PATH_STYLE?.trim().toLowerCase();
	const forcePathStyle = forceRaw !== 'false' && forceRaw !== '0';
	return { endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle };
}

function printHelp() {
	console.log(`Usage:
  pnpm --filter @verimaya/api files:migrate-s3
  pnpm --filter @verimaya/api files:migrate-s3 -- --apply

Options:
  --dry-run   Count and list only (default)
  --apply     Upload to R2/S3 and update storage_key
  --help      Show this help

Notes:
  - Uses DATABASE_URL (owner). DATABASE_URL_APP cannot see all tenants under RLS.
  - Skips local://pending and non-ready rows.
  - Does not delete local files after upload.`);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		printHelp();
		return;
	}

	const databaseUrl = process.env.DATABASE_URL?.trim();
	if (!databaseUrl) {
		throw new Error('Missing DATABASE_URL (owner connection; not DATABASE_URL_APP)');
	}

	const sql = postgres(databaseUrl, { max: 1 });
	try {
		const rows = await sql`
			SELECT id, tenant_id, patient_id, storage_key, mime_type, filename, size_bytes, status
			FROM files
			WHERE storage_key LIKE ${LOCAL_SCHEME + '%'}
				AND storage_key <> ${LOCAL_SCHEME + 'pending'}
				AND status = 'ready'
			ORDER BY created_at ASC
		`;

		console.log(
			`Mode: ${args.apply ? 'APPLY' : 'DRY-RUN'} | candidates: ${rows.length} | UPLOAD_DIR=${getUploadDir()}`
		);

		if (rows.length === 0) {
			console.log('Nothing to migrate.');
			return;
		}

		/** @type {{ id: string, from: string, to: string, path: string | null, ok: boolean, reason?: string }[]} */
		const plan = [];
		for (const row of rows) {
			const s3Key = localToS3Key(row.storage_key);
			const abs = resolveLocalFilePath(row.storage_key);
			if (!s3Key) {
				plan.push({
					id: row.id,
					from: row.storage_key,
					to: '',
					path: abs,
					ok: false,
					reason: 'invalid local key'
				});
				continue;
			}
			if (!abs || !fs.existsSync(abs)) {
				plan.push({
					id: row.id,
					from: row.storage_key,
					to: s3Key,
					path: abs,
					ok: false,
					reason: 'local file missing'
				});
				continue;
			}
			const st = fs.statSync(abs);
			if (st.size !== row.size_bytes) {
				plan.push({
					id: row.id,
					from: row.storage_key,
					to: s3Key,
					path: abs,
					ok: false,
					reason: `size mismatch disk=${st.size} db=${row.size_bytes}`
				});
				continue;
			}
			plan.push({ id: row.id, from: row.storage_key, to: s3Key, path: abs, ok: true });
		}

		const eligible = plan.filter((p) => p.ok);
		const skipped = plan.filter((p) => !p.ok);
		console.log(`Eligible: ${eligible.length} | Skipped: ${skipped.length}`);
		for (const p of plan.slice(0, 50)) {
			const mark = p.ok ? 'OK' : 'SKIP';
			console.log(`  [${mark}] ${p.id}  ${p.from} → ${p.to || '(n/a)'}${p.reason ? ` (${p.reason})` : ''}`);
		}
		if (plan.length > 50) {
			console.log(`  … ${plan.length - 50} more`);
		}

		if (!args.apply) {
			console.log('Dry-run only. Re-run with --apply to upload and update storage_key.');
			return;
		}

		if (eligible.length === 0) {
			console.log('No eligible rows to apply.');
			return;
		}

		const cfg = readS3Config();
		const client = new S3Client({
			region: cfg.region,
			endpoint: cfg.endpoint,
			forcePathStyle: cfg.forcePathStyle,
			credentials: {
				accessKeyId: cfg.accessKeyId,
				secretAccessKey: cfg.secretAccessKey
			}
		});

		let migrated = 0;
		for (const p of eligible) {
			const objectKey = resolveS3ObjectKey(p.to);
			if (!objectKey || !p.path) {
				console.error(`  FAIL ${p.id}: bad object key`);
				continue;
			}
			const body = fs.readFileSync(p.path);
			const row = rows.find((r) => r.id === p.id);
			await client.send(
				new PutObjectCommand({
					Bucket: cfg.bucket,
					Key: objectKey,
					Body: body,
					ContentType: row?.mime_type ?? 'application/octet-stream',
					ContentDisposition: row?.filename
						? `attachment; filename="${String(row.filename).replace(/"/g, '')}"`
						: undefined
				})
			);

			const head = await client.send(
				new HeadObjectCommand({ Bucket: cfg.bucket, Key: objectKey })
			);
			const remoteSize = Number(head.ContentLength ?? 0);
			if (remoteSize !== body.length) {
				console.error(
					`  FAIL ${p.id}: remote size ${remoteSize} != local ${body.length} (DB not updated)`
				);
				continue;
			}

			const updated = await sql`
				UPDATE files
				SET storage_key = ${p.to}
				WHERE id = ${p.id}::uuid
					AND storage_key = ${p.from}
				RETURNING id
			`;
			if (updated.length === 0) {
				console.error(`  FAIL ${p.id}: DB update raced or key already changed`);
				continue;
			}

			migrated += 1;
			console.log(`  DONE ${p.id} → ${p.to}`);
		}

		console.log(`Migrated ${migrated} / ${eligible.length} eligible files.`);
		console.log('Local files were left in place — delete manually after verification.');
	} finally {
		await sql.end({ timeout: 5 });
	}
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exitCode = 1;
});
