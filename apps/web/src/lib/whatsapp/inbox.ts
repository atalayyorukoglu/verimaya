import type { InboundMessage } from '@verimaya/shared';
import { apiGet, listUrl } from '$lib/api';

/** Sunucunun izin verdiği en büyük sayfa. */
const PAGE_LIMIT = 100;
/** Onaylanan/yoksayılan satırlar da listede kaldığı için sınırsız çekmek büyür. */
const MAX_PAGES = 5;

/**
 * Gelen kutusunun tamamı, sayfa sayfa.
 *
 * Tek istek sunucunun varsayılan 25 satırını getiriyordu ve arayüzde "daha
 * fazla" yoktu: geçmişten aktarılan (daha eski tarihli) 80 mesaj listeye hiç
 * çıkmadı (2026-09-15). Aynı `queryKey`'i iki sayfa paylaşıyor; ikisi de bu
 * fonksiyonu kullansın ki önbellekte hangisinin sonucu olduğu fark etmesin.
 */
export async function fetchAllInbox(): Promise<{ messages: InboundMessage[] }> {
	const messages: InboundMessage[] = [];
	let cursor: string | undefined;
	for (let i = 0; i < MAX_PAGES; i++) {
		const page = await apiGet<{ messages: InboundMessage[]; next_cursor: string | null }>(
			listUrl('whatsapp/inbox', { limit: PAGE_LIMIT, cursor })
		);
		messages.push(...page.messages);
		if (!page.next_cursor) break;
		cursor = page.next_cursor;
	}
	return { messages };
}
