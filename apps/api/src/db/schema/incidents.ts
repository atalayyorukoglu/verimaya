import {
	check,
	date,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appointments } from './appointments';
import { contacts } from './contacts';
import { incidentTypes } from './incident-types';
import { tenants } from './tenants';

/**
 * Olay kaydı — "ne oldu"yu değil "ne ters gitti"yi tutan kayıt.
 * docs/2026-08-23-maya-icgoru-sorulari.md § 5.
 *
 * **RPT randevusuyla karıştırılmaz.** RPT randevusu *olgu* (gerçekten yapılan bir
 * randevu, takvimde yeri var); olay kaydı *yorum* ("bu revizyon ilk operasyon
 * tutmadığı için oldu"). Opsiyonel `appointmentId` ile bağlanabilirler ama biri
 * diğerini otomatik oluşturmaz/silmez — `appointments` tablosuna bu iş için
 * dokunulmadı.
 */
export const incidents = pgTable(
	'incidents',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		/** Dosya (hasta). Olay dosyaya ait, bağımsız anlamı yok — dosya silinirse gider. */
		contactId: uuid('contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		/** Kullanımdaki tür silinemez — tür olayın ne olduğunu tanımlıyor. */
		incidentTypeId: uuid('incident_type_id')
			.notNull()
			.references(() => incidentTypes.id, { onDelete: 'restrict' }),
		/** Denormalized `incident_types.area` — rapor sorgusu join'siz filtreler. */
		area: text('area').notNull(),
		/** Opsiyonel — randevu silinirse olay düşmez, yalnız bağı kopar. */
		appointmentId: uuid('appointment_id').references(() => appointments.id, {
			onDelete: 'set null'
		}),
		/** Hangi klinik / hangi personel. */
		responsibleContactId: uuid('responsible_contact_id').references(() => contacts.id, {
			onDelete: 'set null'
		}),
		/** Kuruş; `costCurrency` ile birlikte dolu ya da birlikte boş (CHECK). */
		costAmount: integer('cost_amount'),
		costCurrency: text('cost_currency'),
		status: text('status').notNull().default('open'),
		description: text('description'),
		/** Olayın tarihi — `createdAt` kayıt tarihi, ikisi farklı olabilir. */
		occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
		resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(table) => [
		index('incidents_tenant_id_contact_id_idx').on(table.tenantId, table.contactId),
		index('incidents_tenant_id_area_occurred_on_idx').on(
			table.tenantId,
			table.area,
			table.occurredOn
		),
		index('incidents_tenant_id_status_idx').on(table.tenantId, table.status),
		check(
			'incidents_area_chk',
			sql`${table.area} IN ('clinic', 'hotel', 'transfer', 'sales', 'marketing', 'coordination')`
		),
		check('incidents_status_chk', sql`${table.status} IN ('open', 'resolved')`),
		check(
			'incidents_cost_pair_chk',
			sql`(${table.costAmount} IS NULL) = (${table.costCurrency} IS NULL)`
		)
	]
);

export type IncidentRow = typeof incidents.$inferSelect;
export type NewIncidentRow = typeof incidents.$inferInsert;
