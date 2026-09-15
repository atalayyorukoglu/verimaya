import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { InboundMessageContactRef } from '@verimaya/shared';
import { contacts } from '../db/schema/contacts';
import { inboundMessageContacts } from '../db/schema/inbound-message-contacts';
import { inboundMessages } from '../db/schema/inbound-messages';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { asRecord, extractInboundDisplayFields } from './inbound-mapper';
import { kisiBul, type KisiAdayi, type KisiEslesme } from './kisi-eslestir';

/**
 * KISI-01 — mesaj ↔ kişi bağını kurar ve okur.
 *
 * Eşleştirme kuralı `kisi-eslestir.ts`'te (saf, testli); burası yalnız kişi
 * listesini yükler, sonucu yazar ve geri okur. Bağ kurmak asla ana işi
 * düşürmez: çağıranlar try/catch içinde çağırır.
 */
@Injectable()
export class MessageContactsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	/** Kiracının silinmemiş tüm kişileri — eşleştirme bir kez yüklenip yeniden kullanılır. */
	async directoryWithDb(db: TenantDb): Promise<KisiAdayi[]> {
		const rows = await db
			.select({
				id: contacts.id,
				displayName: contacts.displayName,
				firstName: contacts.firstName,
				lastName: contacts.lastName,
				contactTypeName: contacts.contactTypeName,
				isInternal: contacts.isInternal
			})
			.from(contacts)
			.where(isNull(contacts.deletedAt));
		return rows;
	}

	/** Tek mesajı bağlar; aynı bağ ikinci kez yazılmaz (unique + do nothing). */
	async linkWithDb(
		db: TenantDb,
		tenantId: string,
		messageId: string,
		body: string | null,
		adaylar: KisiAdayi[]
	): Promise<KisiEslesme[]> {
		const eslesmeler = kisiBul(body, adaylar);
		if (eslesmeler.length === 0) return [];
		await db
			.insert(inboundMessageContacts)
			.values(
				eslesmeler.map((e) => ({
					tenantId,
					inboundMessageId: messageId,
					contactId: e.contactId,
					method: e.method,
					matchedText: e.matchedText
				}))
			)
			.onConflictDoNothing({
				target: [
					inboundMessageContacts.tenantId,
					inboundMessageContacts.inboundMessageId,
					inboundMessageContacts.contactId
				]
			});
		return eslesmeler;
	}

	/** Liste yanıtı için: mesaj id → bahsedilen kişiler (tek sorgu). */
	async contactsForMessagesWithDb(
		db: TenantDb,
		messageIds: string[]
	): Promise<Map<string, InboundMessageContactRef[]>> {
		const out = new Map<string, InboundMessageContactRef[]>();
		if (messageIds.length === 0) return out;
		const rows = await db
			.select({
				messageId: inboundMessageContacts.inboundMessageId,
				contactId: inboundMessageContacts.contactId,
				method: inboundMessageContacts.method,
				displayName: contacts.displayName
			})
			.from(inboundMessageContacts)
			.innerJoin(contacts, eq(contacts.id, inboundMessageContacts.contactId))
			.where(
				and(
					inArray(inboundMessageContacts.inboundMessageId, messageIds),
					isNull(contacts.deletedAt)
				)
			)
			.orderBy(asc(contacts.displayName));
		for (const r of rows) {
			const list = out.get(r.messageId) ?? [];
			list.push({
				id: r.contactId,
				display_name: r.displayName,
				method: r.method as InboundMessageContactRef['method']
			});
			out.set(r.messageId, list);
		}
		return out;
	}

	/**
	 * Geçmişi tarar: kiracının tüm mesajlarını (durumu ne olursa olsun) yeniden
	 * eşleştirir. Yeni kişi eklenince ya da kural düzelince koşturulur.
	 *
	 * Kural bağları TÜRETİLMİŞ veridir: önce silinir, sonra baştan kurulur — kural
	 * sıkılaşınca eski yanlış bağlar da gitsin (ilk ölçümde 2.000 soyad bağının
	 * çoğu yanlıştı). Elle kurulan (`manual`) bağa dokunulmaz. 500'lük sayfalar.
	 */
	async relinkAll(tenantId: string): Promise<{ processed: number; linked: number }> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const adaylar = await this.directoryWithDb(db);
			await db.delete(inboundMessageContacts).where(ne(inboundMessageContacts.method, 'manual'));
			let processed = 0;
			let linked = 0;
			// Sayfalama yalnız id ile: created_at üzerinden gidince Postgres'in
			// mikrosaniyesi JS Date'in milisaniyesine sığmıyor, son satır her sayfada
			// yeniden geliyor ve döngü bitmiyordu. Tam tarama için sıra önemsiz.
			let afterId: string | null = null;

			for (;;) {
				const rows: { id: string; payload: unknown }[] = await db
					.select({ id: inboundMessages.id, payload: inboundMessages.payload })
					.from(inboundMessages)
					.where(afterId ? gt(inboundMessages.id, afterId) : undefined)
					.orderBy(asc(inboundMessages.id))
					.limit(500);
				if (rows.length === 0) break;

				for (const row of rows) {
					const display = extractInboundDisplayFields(asRecord(row.payload) ?? {});
					processed++;
					const es = await this.linkWithDb(db, tenantId, row.id, display.body, adaylar);
					linked += es.length;
				}
				afterId = rows[rows.length - 1].id;
			}
			return { processed, linked };
		});
	}

	/** Kişinin adı geçen mesajların sayısı — Kişi Akışı rozeti için. */
	async countForContactWithDb(db: TenantDb, contactId: string): Promise<number> {
		const [row] = await db
			.select({ n: sql<number>`count(*)::int` })
			.from(inboundMessageContacts)
			.where(eq(inboundMessageContacts.contactId, contactId));
		return row?.n ?? 0;
	}
}
