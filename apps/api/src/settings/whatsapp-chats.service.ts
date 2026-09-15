import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import type { WhatsappChatCreate, WhatsappChatUpdate } from '@verimaya/shared';
import { inboundMessages, whatsappChats } from '../db/schema';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { toWhatsappChat } from '../common/mappers';

/**
 * Sohbet kimliğini `inbound_messages.payload` içinden okuyan SQL.
 *
 * TEK KAYNAK: `inbound-mapper.ts`'teki `extractChatId` ile aynı anahtarları aynı
 * sırayla dener. İkisi ayrışırsa adlandırılmış grup "adsız" listesinde de görünür,
 * o yüzden burada tek bir sabit olarak duruyor.
 */
const CHAT_ID_SQL = sql`coalesce(
	nullif(btrim(${inboundMessages.payload}->'payload'->>'chatId'), ''),
	nullif(btrim(${inboundMessages.payload}->'payload'->>'chat_id'), ''),
	nullif(btrim(${inboundMessages.payload}->'payload'->>'from'), ''),
	nullif(btrim(${inboundMessages.payload}->>'chatId'), ''),
	nullif(btrim(${inboundMessages.payload}->>'chat_id'), ''),
	nullif(btrim(${inboundMessages.payload}->>'from'), '')
)`;

const BODY_SQL = sql`coalesce(
	nullif(btrim(${inboundMessages.payload}->'payload'->>'body'), ''),
	nullif(btrim(${inboundMessages.payload}->'payload'->>'text'), ''),
	nullif(btrim(${inboundMessages.payload}->'payload'->>'caption'), ''),
	nullif(btrim(${inboundMessages.payload}->>'body'), ''),
	nullif(btrim(${inboundMessages.payload}->>'text'), '')
)`;

export type ChatDirectoryEntry = { name: string; purpose: string };

@Injectable()
export class WhatsappChatsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	/**
	 * Sohbet kimliği → ad/görev. Gelen kutusu her satır için ayrı sorgu atmasın diye
	 * tek seferde tüm kayıtlı sohbetleri okur (kiracı başına onlarca satır, binlerce değil).
	 */
	async directoryWithDb(db: TenantDb): Promise<Map<string, ChatDirectoryEntry>> {
		const rows = await db
			.select({
				chatId: whatsappChats.chatId,
				name: whatsappChats.name,
				purpose: whatsappChats.purpose
			})
			.from(whatsappChats);
		return new Map(rows.map((r) => [r.chatId, { name: r.name, purpose: r.purpose }]));
	}

	async list(tenantId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db.select().from(whatsappChats).orderBy(asc(whatsappChats.name));

			// Sohbet başına mesaj sayısı: adlandırılmış olanların yanında göstermek ve
			// adsızları "en çok konuşulan önce" sıralamak için tek geçişte alınır.
			const counts = await db
				.select({
					chatId: sql<string>`${CHAT_ID_SQL}`.as('chat_id'),
					total: sql<number>`count(*)::int`.as('total'),
					lastAt: sql<Date>`max(${inboundMessages.createdAt})`.as('last_at')
				})
				.from(inboundMessages)
				.groupBy(sql`1`);

			const countByChat = new Map(counts.map((c) => [c.chatId, c]));
			const known = new Set(rows.map((r) => r.chatId));

			const unnamedIds = counts
				.filter((c) => c.chatId && !known.has(c.chatId))
				.sort((a, b) => b.total - a.total)
				.map((c) => c.chatId);

			// Son mesajın gövdesi hangi grup olduğunu tanımaya yarıyor; yalnız
			// adlandırılmamışlar için okunur.
			const lastBodies = new Map<string, string | null>();
			for (const chatId of unnamedIds) {
				const [row] = await db
					.select({ body: sql<string | null>`${BODY_SQL}` })
					.from(inboundMessages)
					.where(sql`${CHAT_ID_SQL} = ${chatId}`)
					.orderBy(sql`${inboundMessages.createdAt} desc`)
					.limit(1);
				lastBodies.set(chatId, row?.body ? row.body.slice(0, 280) : null);
			}

			return {
				items: rows.map((row) => toWhatsappChat(row, countByChat.get(row.chatId)?.total ?? 0)),
				unnamed: unnamedIds.map((chatId) => {
					const c = countByChat.get(chatId)!;
					return {
						chat_id: chatId,
						message_count: c.total,
						last_body: lastBodies.get(chatId) ?? null,
						last_at: new Date(c.lastAt).toISOString()
					};
				})
			};
		});
	}

	async createWithDb(db: TenantDb, tenantId: string, input: WhatsappChatCreate) {
		const [row] = await db
			.insert(whatsappChats)
			.values({
				tenantId,
				chatId: input.chat_id.trim(),
				name: input.name.trim(),
				purpose: input.purpose
			})
			.onConflictDoNothing({ target: [whatsappChats.tenantId, whatsappChats.chatId] })
			.returning();

		if (!row) {
			throw new ConflictException({
				error: { code: 'conflict', message: 'Bu sohbet zaten kayıtlı' }
			});
		}
		return toWhatsappChat(row, 0);
	}

	async update(tenantId: string, id: string, input: WhatsappChatUpdate) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db
				.update(whatsappChats)
				.set({
					...(input.name !== undefined ? { name: input.name.trim() } : {}),
					...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
					updatedAt: new Date()
				})
				.where(eq(whatsappChats.id, id))
				.returning();

			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'WhatsApp sohbeti bulunamadı' }
				});
			}
			return toWhatsappChat(row, 0);
		});
	}
}
