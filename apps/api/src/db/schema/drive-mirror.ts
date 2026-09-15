import { index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { inboundMessageMedia } from './inbound-message-media';
import { tenants } from './tenants';
import { createdAt, createdUpdated } from './helpers';

/**
 * DRIVE-01 — kişi başına açılmış Google Drive klasörü.
 * Kök klasör ("Verimaya Hastalar") kimliği `tenant_settings`'te durur; burada
 * yalnız o kökün altındaki kişi klasörleri.
 */
export const driveMirrorFolders = pgTable(
	'drive_mirror_folders',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		contactId: uuid('contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		/** Google Drive klasör kimliği. */
		folderId: text('folder_id').notNull(),
		/** Klasör açılırken kullanılan kişi adı — ad değişirse fark buradan görülür. */
		name: text('name').notNull(),
		...createdUpdated()
	},
	(table) => [
		uniqueIndex('drive_mirror_folders_tenant_contact_uidx').on(table.tenantId, table.contactId)
	]
);

export type DriveMirrorFolderRow = typeof driveMirrorFolders.$inferSelect;

/**
 * DRIVE-01 — hangi ekin hangi kişinin klasörüne kopyalandığı. Aynı ek iki kişiye
 * bağlıysa iki satır olur; `unique (tenant_id, media_id, contact_id)` ikinci
 * yüklemeyi engeller.
 */
export const driveMirrorFiles = pgTable(
	'drive_mirror_files',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		mediaId: uuid('media_id')
			.notNull()
			.references(() => inboundMessageMedia.id, { onDelete: 'cascade' }),
		contactId: uuid('contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		/** Google Drive dosya kimliği — silme ve taşıma bununla yapılır. */
		driveFileId: text('drive_file_id').notNull(),
		name: text('name').notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		createdAt: createdAt()
	},
	(table) => [
		uniqueIndex('drive_mirror_files_tenant_media_contact_uidx').on(
			table.tenantId,
			table.mediaId,
			table.contactId
		),
		index('drive_mirror_files_tenant_contact_idx').on(table.tenantId, table.contactId)
	]
);

export type DriveMirrorFileRow = typeof driveMirrorFiles.$inferSelect;
