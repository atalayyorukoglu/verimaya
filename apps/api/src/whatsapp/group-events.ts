import type { InboundMessage } from '@verimaya/shared';

/**
 * AI-13 — "bir olay, bir kart".
 *
 * WhatsApp'ta tek bir ödeme çoğu zaman arka arkaya birkaç mesaj olarak gelir
 * (11:02 fatura, 11:03 dekont). Bugün her mesaj ayrı kart; ikisi de onaylanırsa
 * aynı gider iki kez kaydolur. Burası o mesajları **işaretler** — birleştirmez.
 * Birleştirme kararı kullanıcınındır (AGENTS.md: insan onayı).
 *
 * Kural tabanlı, model yok: aynı sohbet + dar zaman penceresi + aynı tutar.
 * Tutar zaten iki mesajın da ayrıştırılmış taslağında yazılı.
 */

/** Aynı olay sayılmak için iki mesaj arasındaki en büyük fark. */
export const EVENT_GROUP_WINDOW_MS = 15 * 60 * 1000;

/** Taslaklardaki tutarlar — para birimiyle birlikte, sıralı ve tekil. */
function amountKeys(message: InboundMessage): string[] {
	const records = message.parsed_records ?? [];
	const keys = new Set<string>();
	for (const record of records) {
		if (typeof record.amount === 'number' && record.amount > 0) {
			keys.add(`${record.currency ?? 'TRY'}:${record.amount}`);
		}
	}
	return [...keys];
}

function sharesAmount(a: string[], b: string[]): boolean {
	return a.some((key) => b.includes(key));
}

/**
 * Verilen listedeki mesajlara `group_id` yazar: aynı olaya ait mesajlar grubun
 * **en eski** üyesinin id'sini taşır. Tek başına duran mesajın `group_id`'si null.
 *
 * Sınır: yalnız verilen liste içinde arar. Sayfa sınırında bölünen bir olayın
 * iki yarısı ayrı sayfalarda kalırsa eşleşmez — kabul edilen sapma, çünkü
 * pencere 15 dakika, sayfa ise onlarca mesaj.
 */
export function groupInboundMessages(messages: InboundMessage[]): InboundMessage[] {
	type Group = { id: string; chatId: string; oldestMs: number; amounts: string[]; members: string[] };

	// En eskiden yeniye: grup kimliği her zaman en eski üyenin id'si olsun.
	const ordered = [...messages].sort(
		(a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
	);

	const groups: Group[] = [];
	const groupIdByMessage = new Map<string, string>();

	for (const message of ordered) {
		const chatId = message.chat_id;
		const amounts = amountKeys(message);
		if (!chatId || amounts.length === 0) continue;

		const createdMs = Date.parse(message.created_at);
		if (Number.isNaN(createdMs)) continue;

		const match = groups.find(
			(group) =>
				group.chatId === chatId &&
				createdMs - group.oldestMs <= EVENT_GROUP_WINDOW_MS &&
				sharesAmount(group.amounts, amounts)
		);

		if (match) {
			match.members.push(message.id);
			for (const key of amounts) {
				if (!match.amounts.includes(key)) match.amounts.push(key);
			}
			continue;
		}

		groups.push({
			id: message.id,
			chatId,
			oldestMs: createdMs,
			amounts,
			members: [message.id]
		});
	}

	// Tek üyeli grup grup değildir.
	for (const group of groups) {
		if (group.members.length < 2) continue;
		for (const memberId of group.members) {
			groupIdByMessage.set(memberId, group.id);
		}
	}

	return messages.map((message) => ({
		...message,
		group_id: groupIdByMessage.get(message.id) ?? null
	}));
}
