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

	/**
	 * Metinsiz (görsel/dosya) mesajı bağlamdan bağlar: aynı sohbette, aynı yazarın
	 * 3 dakika içindeki son METİNLİ mesajı hangi kişilere bağlıysa bu mesaj da ona.
	 * Ekip böyle yazıyor: "Dawit Abraham Alp paşa hotel" + bilet görseli.
	 *
	 * Tek SQL, küme işi: `messageId` verilirse yalnız o mesaj (canlı akış), verilmezse
	 * kiracının tüm metinsiz mesajları (yeniden bağlama). Zaten bağı olan mesaja dokunmaz;
	 * kaynak mesajın kendi bağı da `context` olamaz — zincir kurulmaz.
	 */
	async linkMediaByContextWithDb(
		db: TenantDb,
		tenantId: string,
		messageId: string | null
	): Promise<number> {
		const chatId = (t: string) =>
			sql.raw(
				`coalesce(nullif(btrim(${t}.payload->'payload'->>'chatId'), ''), nullif(btrim(${t}.payload->'payload'->>'from'), ''), nullif(btrim(${t}.payload->>'chatId'), ''), nullif(btrim(${t}.payload->>'from'), ''))`
			);
		const author = (t: string) =>
			sql.raw(
				`coalesce(nullif(btrim(${t}.payload->'payload'->>'author'), ''), nullif(btrim(${t}.payload->'payload'->>'participant'), ''), nullif(btrim(${t}.payload->'payload'->>'from'), ''))`
			);
		const body = (t: string) =>
			sql.raw(
				`coalesce(nullif(btrim(${t}.payload->'payload'->>'body'), ''), nullif(btrim(${t}.payload->'payload'->>'caption'), ''), nullif(btrim(${t}.payload->>'body'), ''))`
			);
		const hasMedia = (t: string) =>
			sql.raw(
				`coalesce((${t}.payload->'payload'->>'hasMedia')::boolean, (${t}.payload->>'hasMedia')::boolean, false)`
			);

		const result = await db.execute(sql`
			insert into inbound_message_contacts (tenant_id, inbound_message_id, contact_id, method, matched_text)
			select m.tenant_id, m.id, l.contact_id, 'context', 'önceki mesaj'
			from inbound_messages m
			join lateral (
				select p.id
				from inbound_messages p
				where p.tenant_id = m.tenant_id
					and ${chatId('p')} = ${chatId('m')}
					and ${author('p')} = ${author('m')}
					and p.created_at < m.created_at
					and p.created_at > m.created_at - interval '3 minutes'
					and ${body('p')} is not null
				order by p.created_at desc
				limit 1
			) prev on true
			join inbound_message_contacts l
				on l.inbound_message_id = prev.id and l.method <> 'context'
			where m.tenant_id = ${tenantId}
				and ${messageId ? sql`m.id = ${messageId}` : sql`true`}
				and ${body('m')} is null
				and ${hasMedia('m')}
				and not exists (
					select 1 from inbound_message_contacts x where x.inbound_message_id = m.id
				)
			on conflict (tenant_id, inbound_message_id, contact_id) do nothing
		`);
		return Number((result as unknown as { count?: number }).count ?? 0);
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
			// Metinsiz görsel/dosya mesajları: bağlamdan, tek küme işi.
			linked += await this.linkMediaByContextWithDb(db, tenantId, null);
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
