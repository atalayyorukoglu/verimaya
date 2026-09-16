import type { InboundMessage } from '@verimaya/shared';
import { apiPaths, resolveApiUrl } from '$lib/api';

/**
 * WAHA-01: mesaj ekini yeni sekmede aç.
 *
 * Tam dosya relay ile geldiyse API'den çerezli fetch → blob (`<img src>` çerez
 * taşımaz). Gelmediyse (ek aktarımı öncesi mesajlar, ya da relay o an düştü)
 * WhatsApp'ın mesajla gönderdiği küçük önizleme açılır — küçük ama hiç
 * yoktan iyi; kullanıcı "tıklıyorum, büyümüyor" demişti (2026-09-15).
 */
export async function openInboundMedia(message: InboundMessage): Promise<void> {
	if (message.media) return openInboundMediaByMessageId(message.id);
	if (!message.media_thumbnail) return;
	acikSekmedeGoster(await (await fetch(message.media_thumbnail)).blob());
}

/**
 * EVRAK-01: yalnız mesaj kimliği elde varken (Kişi › Dosyalar listesi `InboundMessage`
 * nesnesi taşımıyor, yalnız ekin künyesini taşıyor).
 */
export async function openInboundMediaByMessageId(messageId: string): Promise<void> {
	const res = await fetch(resolveApiUrl(apiPaths.whatsappInboxMedia(messageId)), {
		credentials: 'include'
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	acikSekmedeGoster(await res.blob());
}

function acikSekmedeGoster(blob: Blob): void {
	const url = URL.createObjectURL(blob);
	window.open(url, '_blank', 'noopener');
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
