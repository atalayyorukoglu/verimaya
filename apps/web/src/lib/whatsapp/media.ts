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
	let blob: Blob;
	if (message.media) {
		const res = await fetch(resolveApiUrl(apiPaths.whatsappInboxMedia(message.id)), {
			credentials: 'include'
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		blob = await res.blob();
	} else if (message.media_thumbnail) {
		blob = await (await fetch(message.media_thumbnail)).blob();
	} else {
		return;
	}
	const url = URL.createObjectURL(blob);
	window.open(url, '_blank', 'noopener');
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
