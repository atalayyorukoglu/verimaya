import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Readable } from 'node:stream';
import { contacts } from '../../db/schema/contacts';
import { driveMirrorFiles, driveMirrorFolders } from '../../db/schema/drive-mirror';
import { inboundMessageContacts } from '../../db/schema/inbound-message-contacts';
import { inboundMessageMedia } from '../../db/schema/inbound-message-media';
import { inboundMessages } from '../../db/schema/inbound-messages';
import { jobs } from '../../db/schema/queue';
import { tenants } from '../../db/schema/tenants';
import { SettingsService } from '../../settings/settings.service';
import { FILE_STORAGE, type FileStoragePort } from '../../storage/storage.types';
import { TenantContextService, type TenantDb } from '../../tenant/tenant-context.service';
import { asRecord, extractInboundDisplayFields } from '../../whatsapp/inbound-mapper';
import {
	DRIVE_MIRROR_BACKFILL_JOB_TYPE,
	DRIVE_MIRROR_MOVE_CONTACT_JOB_TYPE,
	DRIVE_MIRROR_PURGE_CONTACT_JOB_TYPE,
	DRIVE_MIRROR_SYNC_JOB_TYPE
} from '../../queue/drive-mirror.constants';
import { driveFileNameFor, folderNameFor } from './drive-names';
import { mediaDocTypeSlugs, mediaVisitHintSlugs } from '@verimaya/shared';
import type { MediaDocType, MediaVisitHint } from '@verimaya/shared';
import {
	DRIVE_CLIENT,
	DRIVE_CREDENTIAL_PROVIDER,
	DRIVE_LAST_RUN_SETTING_KEY,
	DRIVE_ROOT_FOLDER_NAME,
	DRIVE_ROOT_FOLDER_SETTING_KEY,
	type DriveClientPort,
	type DriveLastRun,
	type DriveStoredSecret
} from './drive.types';

export type DriveMirrorRunResult = {
	sent: number;
	skipped: number;
	failed: number;
};

/** Bir "çift": aynalanacak ek + hangi kişinin klasörüne gideceği. */
type MirrorPair = {
	mediaId: string;
	contactId: string;
	contactName: string;
	messageId: string;
	messageCreatedAt: Date;
	messagePayload: unknown;
	filename: string | null;
	mimeType: string;
	sizeBytes: number;
	storageKey: string;
	/** EVRAK-01 — dosya adına yazılacak tür/vizit etiketi (yoksa null). */
	docType: MediaDocType | null;
	visitHint: MediaVisitHint | null;
};

/** Toplu gönderimde tek turda işlenecek en fazla çift — iş sonsuza koşmasın. */
const BACKFILL_LIMIT = 2000;

/**
 * DRIVE-01 — WhatsApp eklerini firmanın Google Drive'ına aynalar.
 *
 * Yön tek: Verimaya → Drive. Ana kayıt bizim depomuzdur; Drive kopya. Bu yüzden
 * Drive'da bir dosya elle silinirse geri getirmeyiz (defterde satırı durur) —
 * kullanıcının kendi klasöründe yaptığı düzenlemeyi ezmek aynanın işi değil.
 *
 * Kişisiz ek Drive'a gitmez: klasör adı kişi adıdır, kişi yoksa gidecek yer yok.
 * Bir mesaj iki kişiye bağlıysa aynı ek iki klasöre kopyalanır.
 */
@Injectable()
export class DriveMirrorService {
	private readonly logger = new Logger(DriveMirrorService.name);

	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly settings: SettingsService,
		@Inject(DRIVE_CLIENT) private readonly drive: DriveClientPort,
		@Inject(FILE_STORAGE) private readonly storage: FileStoragePort
	) {}

	/** BullMQ girişi — `drive_mirror.*` işlerinin tamamı buradan geçer. */
	async process(jobId: string, tenantId: string): Promise<void> {
		const job = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
			if (!row) return null;
			const now = new Date();
			await db
				.update(jobs)
				.set({ status: 'processing', startedAt: now, updatedAt: now })
				.where(eq(jobs.id, jobId));
			return row;
		});

		// İş satırı yoksa: kuyruğa atan transaction geri alınmış demektir. Hata
		// değil — yeniden denemenin bir faydası olmaz, sessizce bitir.
		if (!job) {
			this.logger.debug(`drive mirror job ${jobId} row missing — skipped`);
			return;
		}

		const payload = (job.payload ?? {}) as Record<string, unknown>;
		try {
			switch (job.jobType) {
				case DRIVE_MIRROR_SYNC_JOB_TYPE:
					await this.syncMessage(tenantId, String(payload.inboundMessageId ?? ''));
					break;
				case DRIVE_MIRROR_BACKFILL_JOB_TYPE:
					await this.backfill(tenantId);
					break;
				case DRIVE_MIRROR_PURGE_CONTACT_JOB_TYPE:
					await this.purgeContact(tenantId, String(payload.contactId ?? ''));
					break;
				case DRIVE_MIRROR_MOVE_CONTACT_JOB_TYPE:
					await this.moveContact(
						tenantId,
						String(payload.fromContactId ?? ''),
						String(payload.toContactId ?? '')
					);
					break;
				default:
					this.logger.warn(`drive mirror job ${jobId} unexpected type ${job.jobType}`);
			}
		} catch (err) {
			await this.finishJob(tenantId, jobId, 'failed', message(err));
			throw err;
		}
		await this.finishJob(tenantId, jobId, 'completed', null);
	}

	/** Tek mesajın eklerini bağlı kişilerin klasörüne kopyalar. */
	async syncMessage(tenantId: string, inboundMessageId: string): Promise<DriveMirrorRunResult> {
		if (!inboundMessageId) return { sent: 0, skipped: 0, failed: 0 };
		return this.mirror(tenantId, inboundMessageId);
	}

	/** Geriye dönük: kişiye bağlı, henüz gönderilmemiş tüm ekler. */
	async backfill(tenantId: string): Promise<DriveMirrorRunResult> {
		const result = await this.mirror(tenantId, null);
		const lastRun: DriveLastRun = {
			at: new Date().toISOString(),
			sent: result.sent,
			skipped: result.skipped,
			failed: result.failed
		};
		await this.settings.setTenantSetting(tenantId, DRIVE_LAST_RUN_SETTING_KEY, lastRun);
		return result;
	}

	/**
	 * KVKK: kişinin Drive'daki dosyaları ve klasörü kalıcı silinir. Defter
	 * satırları da gider — kişi yeniden bağlanırsa sıfırdan kurulur.
	 */
	async purgeContact(tenantId: string, contactId: string): Promise<{ deleted: number }> {
		if (!contactId) return { deleted: 0 };
		const secret = await this.loadSecret(tenantId);
		const rows = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const files = await db
				.select()
				.from(driveMirrorFiles)
				.where(eq(driveMirrorFiles.contactId, contactId));
			const [folder] = await db
				.select()
				.from(driveMirrorFolders)
				.where(eq(driveMirrorFolders.contactId, contactId))
				.limit(1);
			return { files, folder: folder ?? null };
		});

		let deleted = 0;
		if (secret) {
			for (const file of rows.files) {
				try {
					await this.drive.deleteFile({
						refreshToken: secret.refreshToken,
						fileId: file.driveFileId
					});
					deleted++;
				} catch (err) {
					this.logger.warn(`drive purge file ${file.driveFileId} failed: ${message(err)}`);
				}
			}
			if (rows.folder) {
				try {
					await this.drive.deleteFile({
						refreshToken: secret.refreshToken,
						fileId: rows.folder.folderId
					});
				} catch (err) {
					this.logger.warn(`drive purge folder ${rows.folder.folderId} failed: ${message(err)}`);
				}
			}
		}

		// Bağlantı kopmuş olsa bile defter temizlenir: aynı kişi yeniden
		// bağlandığında silinmiş dosya kimliklerine yazmaya çalışmayalım.
		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db.delete(driveMirrorFiles).where(eq(driveMirrorFiles.contactId, contactId));
			await db.delete(driveMirrorFolders).where(eq(driveMirrorFolders.contactId, contactId));
		});
		return { deleted };
	}

	/**
	 * Kişi birleştirme: kaynak kişinin dosyaları hayatta kalanın klasörüne taşınır.
	 * Taşıma başarısız olursa satır yine hayatta kalana devredilir — o dosya eski
	 * klasörde kalır ama yeni ekler doğru klasöre gider ve mükerrer yüklenmez.
	 */
	async moveContact(
		tenantId: string,
		fromContactId: string,
		toContactId: string
	): Promise<{ moved: number }> {
		if (!fromContactId || !toContactId || fromContactId === toContactId) return { moved: 0 };
		const secret = await this.loadSecret(tenantId);
		if (!secret) return { moved: 0 };

		const state = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const files = await db
				.select()
				.from(driveMirrorFiles)
				.where(eq(driveMirrorFiles.contactId, fromContactId));
			const [fromFolder] = await db
				.select()
				.from(driveMirrorFolders)
				.where(eq(driveMirrorFolders.contactId, fromContactId))
				.limit(1);
			const [survivor] = await db
				.select({ id: contacts.id, displayName: contacts.displayName })
				.from(contacts)
				.where(eq(contacts.id, toContactId))
				.limit(1);
			return { files, fromFolder: fromFolder ?? null, survivor: survivor ?? null };
		});
		if (state.files.length === 0 || !state.fromFolder || !state.survivor) {
			await this.dropSourceFolderRow(tenantId, fromContactId);
			return { moved: 0 };
		}

		const rootId = await this.ensureRootFolder(tenantId, secret);
		const targetFolderId = await this.ensureContactFolder(
			tenantId,
			secret,
			rootId,
			state.survivor.id,
			state.survivor.displayName
		);

		let moved = 0;
		for (const file of state.files) {
			try {
				await this.drive.moveFile({
					refreshToken: secret.refreshToken,
					fileId: file.driveFileId,
					fromParentId: state.fromFolder.folderId,
					toParentId: targetFolderId
				});
				moved++;
			} catch (err) {
				this.logger.warn(`drive move file ${file.driveFileId} failed: ${message(err)}`);
			}
			await this.tenantContext.withTenant(tenantId, async ({ db }) => {
				// Hayatta kalanda aynı ek zaten varsa satırı devretmek unique'i
				// bozar — o durumda kaynağın satırı silinir, dosya Drive'da kalır.
				const [clash] = await db
					.select({ id: driveMirrorFiles.id })
					.from(driveMirrorFiles)
					.where(
						and(
							eq(driveMirrorFiles.mediaId, file.mediaId),
							eq(driveMirrorFiles.contactId, toContactId)
						)
					)
					.limit(1);
				if (clash) {
					await db.delete(driveMirrorFiles).where(eq(driveMirrorFiles.id, file.id));
					return;
				}
				await db
					.update(driveMirrorFiles)
					.set({ contactId: toContactId })
					.where(eq(driveMirrorFiles.id, file.id));
			});
		}

		await this.dropSourceFolderRow(tenantId, fromContactId);
		return { moved };
	}

	/** Ayarlar ekranının okuduğu durum (bağlantı + sayaçlar). */
	async status(tenantId: string) {
		const cred = await this.settings.getCredentialStatus(tenantId, DRIVE_CREDENTIAL_PROVIDER);
		const secret = cred.configured ? await this.loadSecret(tenantId) : null;
		const rootFolderId = (await this.settings.getTenantSetting(
			tenantId,
			DRIVE_ROOT_FOLDER_SETTING_KEY
		)) as string | null;
		const lastRun = (await this.settings.getTenantSetting(
			tenantId,
			DRIVE_LAST_RUN_SETTING_KEY
		)) as DriveLastRun | null;

		const counts = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [folders] = await db.select({ n: sql<number>`count(*)::int` }).from(driveMirrorFolders);
			const [files] = await db.select({ n: sql<number>`count(*)::int` }).from(driveMirrorFiles);
			const [pending] = await db
				.select({ n: sql<number>`count(*)::int` })
				.from(inboundMessageMedia)
				.innerJoin(
					inboundMessageContacts,
					eq(inboundMessageContacts.inboundMessageId, inboundMessageMedia.inboundMessageId)
				)
				.innerJoin(contacts, eq(contacts.id, inboundMessageContacts.contactId))
				.leftJoin(
					driveMirrorFiles,
					and(
						eq(driveMirrorFiles.mediaId, inboundMessageMedia.id),
						eq(driveMirrorFiles.contactId, inboundMessageContacts.contactId)
					)
				)
				.where(and(isNull(contacts.deletedAt), isNull(driveMirrorFiles.id)));
			return {
				folders: folders?.n ?? 0,
				files: files?.n ?? 0,
				pending: pending?.n ?? 0
			};
		});

		return {
			connected: cred.configured,
			account_email: secret?.email ?? null,
			root_folder_id: rootFolderId,
			root_folder_url: rootFolderId
				? `https://drive.google.com/drive/folders/${rootFolderId}`
				: null,
			key_version: cred.configured ? (cred.key_version ?? null) : null,
			folder_count: counts.folders,
			mirrored_file_count: counts.files,
			pending_count: counts.pending,
			last_run_at: lastRun?.at ?? null,
			last_run_sent: lastRun?.sent ?? 0,
			last_run_skipped: lastRun?.skipped ?? 0,
			last_run_failed: lastRun?.failed ?? 0
		};
	}

	/** Bağlantı kesilince kök klasör kimliği ve son çalışma özeti de unutulur. */
	async disconnect(tenantId: string): Promise<void> {
		await this.settings.deleteCredential(tenantId, DRIVE_CREDENTIAL_PROVIDER);
		await this.settings.setTenantSetting(tenantId, DRIVE_ROOT_FOLDER_SETTING_KEY, null);
		await this.settings.setTenantSetting(tenantId, DRIVE_LAST_RUN_SETTING_KEY, null);
	}

	// --- iç işler -----------------------------------------------------------

	private async mirror(
		tenantId: string,
		inboundMessageId: string | null
	): Promise<DriveMirrorRunResult> {
		const secret = await this.loadSecret(tenantId);
		// Drive bağlı değilse iş sessizce biter — WhatsApp akışı Drive'a bağımlı değil.
		if (!secret) return { sent: 0, skipped: 0, failed: 0 };

		const { pairs, timezone } = await this.loadPairs(tenantId, inboundMessageId);
		if (pairs.length === 0) return { sent: 0, skipped: 0, failed: 0 };

		const rootId = await this.ensureRootFolder(tenantId, secret);
		const result: DriveMirrorRunResult = { sent: 0, skipped: 0, failed: 0 };

		for (const pair of pairs) {
			try {
				const folderId = await this.ensureContactFolder(
					tenantId,
					secret,
					rootId,
					pair.contactId,
					pair.contactName
				);
				const buf = await this.readBytes(pair.storageKey);
				if (!buf) {
					// Künye var, bayt yok (eski satır / süpürülmüş depo) — hata değil.
					result.skipped++;
					continue;
				}
				const display = extractInboundDisplayFields(asRecord(pair.messagePayload) ?? {});
				const name = driveFileNameFor({
					at: pair.messageCreatedAt,
					timezone,
					body: display.body,
					mimeType: pair.mimeType,
					filename: pair.filename,
					// `other` etiket sayılmaz: adı serbest başlıktan kurmak daha bilgilidir.
					docTypeSlug:
						pair.docType && pair.docType !== 'other' ? mediaDocTypeSlugs[pair.docType] : null,
					visitSlug: pair.visitHint ? mediaVisitHintSlugs[pair.visitHint] : null
				});
				const uploaded = await this.drive.uploadFile({
					refreshToken: secret.refreshToken,
					parentId: folderId,
					name,
					mimeType: pair.mimeType,
					body: buf
				});
				const inserted = await this.tenantContext.withTenant(tenantId, async ({ db }) =>
					db
						.insert(driveMirrorFiles)
						.values({
							tenantId,
							mediaId: pair.mediaId,
							contactId: pair.contactId,
							driveFileId: uploaded.id,
							name,
							sizeBytes: buf.length
						})
						.onConflictDoNothing({
							target: [
								driveMirrorFiles.tenantId,
								driveMirrorFiles.mediaId,
								driveMirrorFiles.contactId
							]
						})
						.returning({ id: driveMirrorFiles.id })
				);
				if (inserted.length === 0) result.skipped++;
				else result.sent++;
			} catch (err) {
				result.failed++;
				this.logger.warn(
					`drive mirror pair media=${pair.mediaId} contact=${pair.contactId} failed: ${message(err)}`
				);
			}
		}
		return result;
	}

	/**
	 * Gönderilecek çiftler: eki olan + kişiye bağlı + henüz aynalanmamış.
	 * Silinmiş (soft-delete) kişiye kopya çıkmaz.
	 */
	private async loadPairs(
		tenantId: string,
		inboundMessageId: string | null
	): Promise<{ pairs: MirrorPair[]; timezone: string }> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [tenantRow] = await db
				.select({ timezone: tenants.timezone })
				.from(tenants)
				.where(eq(tenants.id, tenantId))
				.limit(1);

			const rows = await db
				.select({
					mediaId: inboundMessageMedia.id,
					contactId: inboundMessageContacts.contactId,
					contactName: contacts.displayName,
					messageId: inboundMessages.id,
					messageCreatedAt: inboundMessages.createdAt,
					messagePayload: inboundMessages.payload,
					filename: inboundMessageMedia.filename,
					mimeType: inboundMessageMedia.mimeType,
					sizeBytes: inboundMessageMedia.sizeBytes,
					storageKey: inboundMessageMedia.storageKey,
					docType: inboundMessageMedia.docType,
					visitHint: inboundMessageMedia.visitHint
				})
				.from(inboundMessageMedia)
				.innerJoin(inboundMessages, eq(inboundMessages.id, inboundMessageMedia.inboundMessageId))
				.innerJoin(
					inboundMessageContacts,
					eq(inboundMessageContacts.inboundMessageId, inboundMessageMedia.inboundMessageId)
				)
				.innerJoin(contacts, eq(contacts.id, inboundMessageContacts.contactId))
				.leftJoin(
					driveMirrorFiles,
					and(
						eq(driveMirrorFiles.mediaId, inboundMessageMedia.id),
						eq(driveMirrorFiles.contactId, inboundMessageContacts.contactId)
					)
				)
				.where(
					and(
						isNull(contacts.deletedAt),
						isNull(driveMirrorFiles.id),
						inboundMessageId
							? eq(inboundMessageMedia.inboundMessageId, inboundMessageId)
							: undefined
					)
				)
				.limit(BACKFILL_LIMIT);

			return {
				pairs: rows as MirrorPair[],
				timezone: tenantRow?.timezone ?? 'Europe/Istanbul'
			};
		});
	}

	private async loadSecret(tenantId: string): Promise<DriveStoredSecret | null> {
		let raw: string;
		try {
			raw = await this.settings.loadCredentialSecret(tenantId, DRIVE_CREDENTIAL_PROVIDER);
		} catch {
			return null;
		}
		try {
			const parsed = JSON.parse(raw) as Partial<DriveStoredSecret>;
			if (typeof parsed.refreshToken !== 'string' || !parsed.refreshToken) return null;
			return { refreshToken: parsed.refreshToken, email: parsed.email ?? null };
		} catch {
			return null;
		}
	}

	private async ensureRootFolder(tenantId: string, secret: DriveStoredSecret): Promise<string> {
		const stored = (await this.settings.getTenantSetting(
			tenantId,
			DRIVE_ROOT_FOLDER_SETTING_KEY
		)) as string | null;
		if (
			stored &&
			(await this.drive.folderExists({ refreshToken: secret.refreshToken, folderId: stored }))
		) {
			return stored;
		}
		const folderId = await this.drive.ensureFolder({
			refreshToken: secret.refreshToken,
			name: DRIVE_ROOT_FOLDER_NAME,
			parentId: null
		});
		await this.settings.setTenantSetting(tenantId, DRIVE_ROOT_FOLDER_SETTING_KEY, folderId);
		return folderId;
	}

	private async ensureContactFolder(
		tenantId: string,
		secret: DriveStoredSecret,
		rootId: string,
		contactId: string,
		displayName: string
	): Promise<string> {
		const name = folderNameFor(displayName);
		const existing = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db
				.select()
				.from(driveMirrorFolders)
				.where(eq(driveMirrorFolders.contactId, contactId))
				.limit(1);
			return row ?? null;
		});
		if (
			existing &&
			(await this.drive.folderExists({
				refreshToken: secret.refreshToken,
				folderId: existing.folderId
			}))
		) {
			return existing.folderId;
		}

		const folderId = await this.drive.ensureFolder({
			refreshToken: secret.refreshToken,
			name,
			parentId: rootId
		});
		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db
				.insert(driveMirrorFolders)
				.values({ tenantId, contactId, folderId, name })
				.onConflictDoUpdate({
					target: [driveMirrorFolders.tenantId, driveMirrorFolders.contactId],
					set: { folderId, name, updatedAt: new Date() }
				});
		});
		return folderId;
	}

	private async dropSourceFolderRow(tenantId: string, contactId: string): Promise<void> {
		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db.delete(driveMirrorFolders).where(eq(driveMirrorFolders.contactId, contactId));
		});
	}

	private async readBytes(storageKey: string): Promise<Buffer | null> {
		const stream = await this.storage.getStream(storageKey);
		if (!stream) return null;
		return streamToBuffer(stream);
	}

	private async finishJob(
		tenantId: string,
		jobId: string,
		status: 'completed' | 'failed',
		lastError: string | null
	): Promise<void> {
		try {
			await this.tenantContext.withTenant(tenantId, async ({ db }) => {
				const now = new Date();
				await db
					.update(jobs)
					.set({
						status,
						lastError,
						completedAt: status === 'completed' ? now : null,
						updatedAt: now
					})
					.where(eq(jobs.id, jobId));
			});
		} catch (err) {
			this.logger.warn(`drive mirror job ${jobId} status write failed: ${message(err)}`);
		}
	}
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.from(chunk as Buffer));
	}
	return Buffer.concat(chunks);
}

function message(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
