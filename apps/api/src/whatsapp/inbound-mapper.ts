import type { InboundMessage, TransactionDraft } from '@verimaya/shared';
import { turleriBul } from './mesaj-turu';
import { kisiBilgisiCikar } from './kisi-bilgisi';

export function asRecord(value: unknown): Record<string, unknown> | null {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return null;
}

function pickString(source: Record<string, unknown> | null, keys: string[]): string | null {
	if (!source) return null;
	for (const key of keys) {
		const value = source[key];
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}
	return null;
}

function pickBoolean(source: Record<string, unknown> | null, keys: string[]): boolean {
	if (!source) return false;
	for (const key of keys) {
		const value = source[key];
		if (typeof value === 'boolean') return value;
	}
	return false;
}

/**
 * AI-13: sohbet kimliği (`…@g.us` grup, `…@c.us` birebir). WAHA grup mesajlarında
 * `from` sohbeti, `author` mesajı yazan kişiyi gösterir; birebir sohbette `author`
 * yoktur ve `from` zaten kişidir. Olay gruplaması sohbete göre yapılır, kişiye göre
 * değil — aynı grupta iki kişi aynı ödemeyi yazabilir.
 */
export function extractChatId(payload: Record<string, unknown>): string | null {
	const inner = asRecord(payload.payload) ?? payload;
	return (
		pickString(inner, ['chatId', 'chat_id', 'from']) ?? pickString(payload, ['chatId', 'chat_id'])
	);
}

/** WAHA / provider webhook body → display fields for inbox API. */
export function extractInboundDisplayFields(payload: Record<string, unknown>): {
	chat_name: string | null;
	chat_id: string | null;
	sender: string | null;
	body: string | null;
	has_media: boolean;
	media_path: string | null;
} {
	const inner = asRecord(payload.payload) ?? payload;

	return {
		chat_name:
			pickString(inner, ['chatName', 'chat_name']) ??
			pickString(payload, ['chatName', 'chat_name']),
		chat_id: extractChatId(payload),
		sender: pickString(inner, ['from', 'author', 'sender']),
		body: pickString(inner, ['body', 'text', 'caption']),
		has_media: pickBoolean(inner, ['hasMedia', 'has_media']),
		media_path: pickString(inner, ['mediaPath', 'media_path', 'mediaUrl', 'media_url'])
	};
}

/**
 * WAHA-01: WhatsApp görsel/video/belge mesajıyla birlikte küçük bir JPEG önizleme
 * gönderir (`_data.message.<tür>Message.jpegThumbnail`, base64). Ek indirilmemiş
 * olsa bile var; arayüz "(boş mesaj)" yerine bunu gösterir. Data URL döner.
 */
export function extractMediaThumbnail(payload: Record<string, unknown>): string | null {
	const inner = asRecord(payload.payload) ?? payload;
	const message = asRecord(asRecord(inner._data)?.message);
	if (!message) return null;
	for (const key of ['imageMessage', 'videoMessage', 'documentMessage', 'stickerMessage']) {
		const thumb = asRecord(message[key])?.jpegThumbnail;
		if (typeof thumb === 'string' && thumb.length > 0 && thumb.length <= 150_000) {
			return `data:image/jpeg;base64,${thumb}`;
		}
	}
	return null;
}

export function extractWahaExternalId(
	payload: Record<string, unknown>,
	payloadHash: string,
	headerValue: string | undefined
): string {
	if (headerValue?.trim()) {
		return headerValue.trim();
	}

	const inner = asRecord(payload.payload) ?? payload;
	for (const key of ['id', 'messageId', 'message_id', 'external_id', 'event_id']) {
		const value = inner[key] ?? payload[key];
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}

	return payloadHash;
}

/**
 * Mesajın yazıldığı an. WAHA gövdesinde saniye cinsinden `timestamp` gelir
 * (bazı sürümlerde `messageTimestamp` / `t`, bazen milisaniye). Taslağın işlem
 * tarihi buradan çıkar; yoksa çağıran taraf satırın `created_at`'ine düşer.
 */
export function extractMessageSentAt(payload: Record<string, unknown>): Date | null {
	const inner = asRecord(payload.payload) ?? payload;
	const data = asRecord(inner._data);
	for (const source of [inner, payload, data]) {
		if (!source) continue;
		for (const key of ['timestamp', 'messageTimestamp', 't']) {
			const raw = source[key];
			const value =
				typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseFloat(raw) : NaN;
			if (!Number.isFinite(value) || value <= 0) continue;
			// 10 haneli → saniye, 13 haneli → milisaniye.
			const ms = value > 1e12 ? value : value * 1000;
			const date = new Date(ms);
			if (Number.isNaN(date.getTime())) continue;
			return date;
		}
	}
	return null;
}

export function extractParsedRecords(payload: Record<string, unknown>): TransactionDraft[] | null {
	const value = payload.parsed_records;
	if (!Array.isArray(value)) return null;
	return value as TransactionDraft[];
}

export function extractParseError(payload: Record<string, unknown>): string | null {
	const value = payload.parse_error;
	return typeof value === 'string' ? value : null;
}

/** Merges parse results into the stored payload without touching the raw provider fields. */
export function mergeParsedPayload(
	payload: Record<string, unknown>,
	patch: { parsed_records: TransactionDraft[] | null; parse_error: string | null }
): Record<string, unknown> {
	return { ...payload, parsed_records: patch.parsed_records, parse_error: patch.parse_error };
}

export function toInboundMessage(row: {
	id: string;
	tenantId: string;
	payload: unknown;
	status: string;
	createdAt: Date;
}): InboundMessage {
	const payload = asRecord(row.payload) ?? {};
	const display = extractInboundDisplayFields(payload);
	const turler = turleriBul(display.body);

	return {
		id: row.id,
		tenant_id: row.tenantId,
		chat_name: display.chat_name,
		chat_id: display.chat_id,
		sender: display.sender,
		body: display.body,
		has_media: display.has_media,
		media_path: display.media_path,
		status: row.status as InboundMessage['status'],
		parsed_records: extractParsedRecords(payload),
		parse_error: extractParseError(payload),
		// Gruplama liste düzeyinde hesaplanır (groupInboundMessages); tek satır kendini bilemez.
		group_id: null,
		// Grubun görevi burada bilinmiyor (defter liste düzeyinde okunuyor); varsayılan
		// `mixed` ile yalnız metne bakılır. Çağıran `listInbox` defteri uygulayıp
		// gerekirse yeniden hesaplar.
		message_kinds: turler.turler,
		message_kind_signals: turler.isaretler,
		// KISI-01: bağlar ayrı tabloda; liste düzeyinde tek sorguyla eklenir.
		contacts: [],
		// WAHA-01: ek künyesi ayrı tabloda (liste düzeyinde); önizleme payload'da.
		media: null,
		media_thumbnail: extractMediaThumbnail(payload),
		contact_hint: kisiBilgisiCikar(display.body),
		created_at: row.createdAt.toISOString()
	};
}
