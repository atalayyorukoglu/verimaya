import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../db/client';
import { LocalFileStorage } from '../../storage/local-file.storage';
import type { SettingsService } from '../../settings/settings.service';
import type { TenantContextService } from '../../tenant/tenant-context.service';
import { purgeTenantFixtures } from '../../test/purge-tenant-fixtures';
import { DriveMirrorService } from './drive-mirror.service';
import { DRIVE_CREDENTIAL_PROVIDER, type DriveClientPort } from './drive.types';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
	const { sql } = getDb(databaseUrl);
	await sql`select set_config('app.current_tenant_id', ${tenantId}, false)`;
	try {
		return await fn();
	} finally {
		await sql`select set_config('app.current_tenant_id', '', false)`;
	}
}

type Uploaded = { parentId: string; name: string; bytes: number };

/** Sahte Drive: gerçek ağ yok, yüklenenler bellekte tutulur. */
function fakeDrive() {
	// Gerçekte her kiracı KENDİ Google hesabını bağlar; klasör adı çakışsa bile
	// ayrı hesaplardadır. Sahte istemci de bu yüzden hesaba (refresh token) göre ayırır.
	const folders = new Map<string, { name: string; parentId: string | null; account: string }>();
	const uploads: Uploaded[] = [];
	const deleted: string[] = [];
	const moves: Array<{ fileId: string; from: string; to: string }> = [];
	let seq = 0;

	const client: DriveClientPort = {
		buildAuthorizeUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth',
		exchangeCode: async () => ({ refreshToken: 'rt', email: 'ops@klinik.com' }),
		accountEmail: async () => 'ops@klinik.com',
		ensureFolder: async ({ refreshToken, name, parentId }) => {
			for (const [id, f] of folders) {
				if (f.account === refreshToken && f.name === name && f.parentId === (parentId ?? null)) {
					return id;
				}
			}
			const id = `folder-${++seq}`;
			folders.set(id, { name, parentId: parentId ?? null, account: refreshToken });
			return id;
		},
		folderExists: async ({ folderId }) => folders.has(folderId),
		uploadFile: async ({ parentId, name, body }) => {
			uploads.push({ parentId, name, bytes: body.length });
			return { id: `file-${++seq}` };
		},
		deleteFile: async ({ fileId }) => {
			deleted.push(fileId);
			folders.delete(fileId);
		},
		moveFile: async ({ fileId, fromParentId, toParentId }) => {
			moves.push({ fileId, from: fromParentId, to: toParentId });
		}
	};
	return { client, folders, uploads, deleted, moves };
}

/** Sahte ayarlar: kimlik bilgisi ve tenant ayarları bellekte, şifreleme yok. */
function fakeSettings(connected: Set<string>) {
	const settings = new Map<string, unknown>();
	return {
		store: settings,
		service: {
			getCredentialStatus: async (tenantId: string, provider: string) =>
				connected.has(`${tenantId}:${provider}`)
					? { configured: true as const, key_version: 1 }
					: { configured: false as const },
			loadCredentialSecret: async (tenantId: string, provider: string) => {
				if (!connected.has(`${tenantId}:${provider}`)) throw new Error('not configured');
				return JSON.stringify({ refreshToken: `rt-${tenantId}`, email: 'ops@klinik.com' });
			},
			deleteCredential: async (tenantId: string, provider: string) => {
				connected.delete(`${tenantId}:${provider}`);
			},
			getTenantSetting: async (tenantId: string, key: string) =>
				settings.get(`${tenantId}:${key}`) ?? null,
			setTenantSetting: async (tenantId: string, key: string, value: unknown) => {
				settings.set(`${tenantId}:${key}`, value);
			}
		} as unknown as SettingsService
	};
}

/**
 * DRIVE-01 izolasyon: ayna defteri yalnız kendi kiracısından okunur/yazılır.
 * A ve B'de aynı ada sahip kişiler var; B'nin toplu gönderimi A'nın ekini
 * görmez ve A'nın satırlarını saymaz.
 */
describe('drive_mirror_files / drive_mirror_folders', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const typeA = randomUUID();
	const typeB = randomUUID();
	const contactA = randomUUID();
	const contactA2 = randomUUID();
	const contactB = randomUUID();
	const msgA = randomUUID();
	const msgB = randomUUID();
	const mediaA = randomUUID();
	const mediaB = randomUUID();

	const connected = new Set<string>();
	const drive = fakeDrive();
	const settings = fakeSettings(connected);
	let service: DriveMirrorService;
	let tenantContext: TenantContextService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const uploadDir = mkdtempSync(join(tmpdir(), 'drive-mirror-'));
		process.env.UPLOAD_DIR = uploadDir;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`dm-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`dm-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug, timezone)
			values
				(${tenantA}, 'Tenant A', ${`dm-a-${tenantA.slice(0, 8)}`}, 'Europe/Istanbul'),
				(${tenantB}, 'Tenant B', ${`dm-b-${tenantB.slice(0, 8)}`}, 'Europe/Istanbul')
		`;

		const storage = new LocalFileStorage();
		for (const [tenant, type, contact, msg, media] of [
			[tenantA, typeA, contactA, msgA, mediaA],
			[tenantB, typeB, contactB, msgB, mediaB]
		] as const) {
			const storageKey = storage.buildKey(tenant, `whatsapp-${msg}`, media);
			await storage.put(storageKey, Buffer.from(`bilet-${tenant.slice(0, 4)}`), {
				contentType: 'image/jpeg'
			});
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenant}, true)`;
				await tx`insert into contact_types (id, tenant_id, name) values (${type}, ${tenant}, 'Hasta')`;
				await tx`
					insert into contacts (id, tenant_id, contact_type_id, contact_type_name, first_name, last_name, display_name)
					values (${contact}, ${tenant}, ${type}, 'Hasta', 'Ayşe', 'Yılmaz', 'Ayşe Yılmaz')
				`;
				await tx`
					insert into inbound_messages (id, tenant_id, provider, external_id, payload, status, created_at)
					values (
						${msg}, ${tenant}, 'waha', ${`dm-${tenant.slice(0, 8)}`},
						${JSON.stringify({ payload: { from: '1@g.us', body: 'Uçuş bileti — İstanbul' } })}::jsonb,
						'new', '2026-09-15T08:05:00Z'
					)
				`;
				await tx`
					insert into inbound_message_media (id, tenant_id, inbound_message_id, filename, mime_type, size_bytes, sha256, storage_key)
					values (${media}, ${tenant}, ${msg}, 'bilet.jpg', 'image/jpeg', 12, ${`sha-${media}`}, ${storageKey})
				`;
				await tx`
					insert into inbound_message_contacts (tenant_id, inbound_message_id, contact_id, method, matched_text)
					values (${tenant}, ${msg}, ${contact}, 'exact', 'Ayşe Yılmaz')
				`;
			});
		}

		// A'da ikinci bir kişi: birleştirme testinin hedefi.
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`
				insert into contacts (id, tenant_id, contact_type_id, contact_type_name, first_name, last_name, display_name)
				values (${contactA2}, ${tenantA}, ${typeA}, 'Hasta', 'Ayşe', 'Yilmaz', 'Ayse Yilmaz (2)')
			`;
		});

		tenantContext = {
			withTenant: async <T>(tenantId: string, fn: (ctx: { db: typeof db }) => Promise<T>) =>
				withTenantSession(tenantId, () => fn({ db }))
		} as TenantContextService;

		service = new DriveMirrorService(
			tenantContext,
			settings.service,
			drive.client,
			new LocalFileStorage()
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	/** RLS altında sayım: `verimaya_app` NOBYPASSRLS, oturum açılmadan satır görünmez. */
	async function countRows(tenantId: string, contactId: string | null): Promise<number> {
		const { sql } = getDb(databaseUrl);
		return sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const rows = contactId
				? await tx`select 1 from drive_mirror_files where contact_id = ${contactId}`
				: await tx`select 1 from drive_mirror_files`;
			return rows.length;
		});
	}

	it('Drive bağlı değilse iş sessizce biter — hiçbir şey yüklenmez', async () => {
		const result = await service.syncMessage(tenantA, msgA);
		expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
		expect(drive.uploads).toHaveLength(0);
	});

	it('kök klasör + kişi klasörü açar, dosyayı tarih-açıklama adıyla yükler', async () => {
		connected.add(`${tenantA}:${DRIVE_CREDENTIAL_PROVIDER}`);
		const result = await service.syncMessage(tenantA, msgA);
		expect(result).toMatchObject({ sent: 1, failed: 0 });

		const rootId = settings.store.get(`${tenantA}:drive.root_folder_id`) as string;
		expect(drive.folders.get(rootId)).toMatchObject({
			name: 'Verimaya Hastalar',
			parentId: null
		});

		expect(drive.uploads).toHaveLength(1);
		const [upload] = drive.uploads;
		expect(drive.folders.get(upload.parentId)).toMatchObject({
			name: 'Ayse Yilmaz',
			parentId: rootId
		});
		expect(upload.name).toBe('2026-09-15-1105-ucus-bileti-istanbul.jpg');
	});

	it('aynı ek ikinci kez gönderilmez', async () => {
		const result = await service.syncMessage(tenantA, msgA);
		expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
		expect(drive.uploads).toHaveLength(1);
	});

	it("B'nin toplu gönderimi A'nın ekini görmez", async () => {
		connected.add(`${tenantB}:${DRIVE_CREDENTIAL_PROVIDER}`);
		const before = drive.uploads.length;
		const result = await service.backfill(tenantB);
		expect(result).toMatchObject({ sent: 1, failed: 0 });
		expect(drive.uploads).toHaveLength(before + 1);
		// B'nin kendi kökü; A'nınkiyle karışmaz.
		const rootB = settings.store.get(`${tenantB}:drive.root_folder_id`) as string;
		const rootA = settings.store.get(`${tenantA}:drive.root_folder_id`) as string;
		expect(rootB).not.toBe(rootA);
	});

	it('durum sayaçları yalnız kendi kiracısını sayar', async () => {
		const a = await service.status(tenantA);
		const b = await service.status(tenantB);
		expect(a).toMatchObject({ connected: true, mirrored_file_count: 1, pending_count: 0 });
		expect(b).toMatchObject({ connected: true, mirrored_file_count: 1, pending_count: 0 });
		expect(a.root_folder_url).toContain('https://drive.google.com/drive/folders/');
	});

	it('kişi birleştirmede dosya hayatta kalanın klasörüne taşınır', async () => {
		const movesBefore = drive.moves.length;
		const moved = await service.moveContact(tenantA, contactA, contactA2);
		expect(moved.moved).toBe(1);
		expect(drive.moves).toHaveLength(movesBefore + 1);
		// Hedef, hayatta kalanın klasörü — kaynağınki değil.
		const lastMove = drive.moves.at(-1)!;
		expect(drive.folders.get(lastMove.to)).toMatchObject({ name: 'Ayse Yilmaz (2)' });

		const rows = await countRows(tenantA, contactA2);
		expect(rows).toBe(1);
	});

	it('KVKK silmesi kişinin dosyalarını ve klasörünü siler', async () => {
		await service.purgeContact(tenantA, contactA2);
		expect(await countRows(tenantA, null)).toBe(0);
		// B'nin satırı duruyor — silme kiracıyı aşmadı.
		expect(await countRows(tenantB, null)).toBe(1);
	});

	it("B, A'nın defter satırını RLS altında göremez", async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const rows = await tx`select tenant_id from drive_mirror_files`;
			expect(rows.every((r) => r.tenant_id === tenantB)).toBe(true);
			const folders = await tx`select tenant_id from drive_mirror_folders`;
			expect(folders.every((r) => r.tenant_id === tenantB)).toBe(true);
		});
	});
});
