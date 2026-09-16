import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { ContactVisitDraft } from '@verimaya/shared';
import { contacts } from './contacts';
import { inboundMessages } from './inbound-messages';
import { tenants } from './tenants';
import { createdUpdated, timestamptz } from './helpers';

/**
 * VIZIT-01 — hasta vizitleri. Akış vizit başına ilerliyor (konsültasyon / 1 / 2 / RPT);
 * evrak seti, tahsilat ve gider buna bağlanacak.
 *
 * Soft-delete: `deleted_at`. Silme ucu ayrıca `status`'ü `cancelled` yapar — liste
 * dışına düşen bir vizit "iptal oldu" demektir, ortadan kalkmış değil.
 */
export const contactVisits = pgTable(
	'contact_visits',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		contactId: uuid('contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		/** consultation | visit_1 | visit_2 | visit_3 | rpt | other (0078 check kısıtı). */
		visitType: text('visit_type').notNull(),
		/** Kaçıncı vizit; RPT/konsültasyonda genelde boş. */
		sequence: integer('sequence'),
		arrivalAt: timestamptz('arrival_at'),
		/** Mesajda saat yoksa false — arayüz gece yarısını uçuş saati sanmasın. */
		arrivalTimeKnown: boolean('arrival_time_known').notNull().default(true),
		departureAt: timestamptz('departure_at'),
		departureTimeKnown: boolean('departure_time_known').notNull().default(true),
		arrivalFlight: text('arrival_flight'),
		departureFlight: text('departure_flight'),
		hotel: text('hotel'),
		/** company | patient | unknown — RPT kuralının (otel verilmez) dayanağı. */
		hotelCoveredBy: text('hotel_covered_by').notNull().default('unknown'),
		transferProvider: text('transfer_provider'),
		clinic: text('clinic'),
		doctor: text('doctor'),
		treatmentPlan: text('treatment_plan'),
		/** planned | in_progress | completed | cancelled. */
		status: text('status').notNull().default('planned'),
		notes: text('notes'),
		sourceInboundMessageId: uuid('source_inbound_message_id').references(() => inboundMessages.id, {
			onDelete: 'set null'
		}),
		createdBy: text('created_by'),
		deletedAt: timestamptz('deleted_at'),
		...createdUpdated()
	},
	(table) => [
		index('contact_visits_tenant_contact_arrival_idx').on(
			table.tenantId,
			table.contactId,
			table.arrivalAt
		),
		index('contact_visits_tenant_status_arrival_idx').on(
			table.tenantId,
			table.status,
			table.arrivalAt
		)
	]
);

export type ContactVisitRow = typeof contactVisits.$inferSelect;
export type NewContactVisitRow = typeof contactVisits.$inferInsert;

/**
 * VIZIT-01 — WhatsApp'tan çıkarılan vizit **önerisi**. Kesin kayıt değil; kullanıcı
 * kuyrukta alanları düzeltip onaylayınca `contact_visits` satırı doğar.
 *
 * Neden `record_update_suggestions`'a eklenmedi: o tablo `appointment_id NOT NULL`
 * + tek alan/tek değer çifti üzerine kurulu (bir randevunun tarihi ya da oteli).
 * Vizit önerisi bir **kişiye** ait ve tek seferde 8 alan taşıyor; oraya sığdırmak
 * appointment_id'yi nullable yapmayı, kısmi tekillik kısıtını bozmayı ve mevcut
 * onay yolunu dallandırmayı gerektirirdi. Ayrı tablo daha ucuz ve daha dürüst.
 */
export const contactVisitSuggestions = pgTable(
	'contact_visit_suggestions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		contactId: uuid('contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		inboundMessageId: uuid('inbound_message_id').references(() => inboundMessages.id, {
			onDelete: 'set null'
		}),
		/** `contactVisitDraftSchema` — kuyrukta düzenlenebilir taslak. */
		draft: jsonb('draft').$type<ContactVisitDraft>().notNull(),
		sourceText: text('source_text').notNull(),
		confidence: text('confidence').notNull(),
		status: text('status').notNull().default('pending'),
		createdVisitId: uuid('created_visit_id').references(() => contactVisits.id, {
			onDelete: 'set null'
		}),
		decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
		decidedBy: text('decided_by'),
		rejectReason: text('reject_reason'),
		deletedAt: timestamptz('deleted_at'),
		...createdUpdated()
	},
	(table) => [
		index('contact_visit_suggestions_tenant_status_created_idx').on(
			table.tenantId,
			table.status,
			table.createdAt
		),
		/*
		 * Aynı mesaj + aynı kişi için tek öneri — kuyruk işlemcisi mesajı yeniden
		 * işlerse (yeniden deneme, yeniden bağlama) mükerrer kart doğmasın. Reddedilmiş
		 * bir öneri de bu kısıtın kapsamında: kullanıcı "hayır" dediyse tekrar sorulmaz.
		 */
		uniqueIndex('contact_visit_suggestions_tenant_message_contact_uidx')
			.on(table.tenantId, table.inboundMessageId, table.contactId)
			.where(sql`${table.deletedAt} is null and ${table.inboundMessageId} is not null`)
	]
);

export type ContactVisitSuggestionRow = typeof contactVisitSuggestions.$inferSelect;
export type NewContactVisitSuggestionRow = typeof contactVisitSuggestions.$inferInsert;
