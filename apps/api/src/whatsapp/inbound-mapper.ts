import type { InboundMessage, TransactionDraft } from '@verimaya/shared';

function asRecord(value: unknown): Record<string, unknown> | null {
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

/** WAHA / provider webhook body → display fields for inbox API. */
export function extractInboundDisplayFields(payload: Record<string, unknown>): {
	chat_name: string | null;
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
		sender: pickString(inner, ['from', 'author', 'sender']),
		body: pickString(inner, ['body', 'text', 'caption']),
		has_media: pickBoolean(inner, ['hasMedia', 'has_media']),
		media_path: pickString(inner, ['mediaPath', 'media_path', 'mediaUrl', 'media_url'])
	};
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

export function extractParsedRecords(payload: Record<string, unknown>): TransactionDraft[] | null {
	const value = payload.parsed_records;
	if (!Array.isArray(value)) return null;
	return value as TransactionDraft[];
}

export function extractParseError(payload: Record<string, unknown>): string | null {
	const value = payload.parse_error;
	return typeof value === 'string' ? value : null;
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

	return {
		id: row.id,
		tenant_id: row.tenantId,
		chat_name: display.chat_name,
		sender: display.sender,
		body: display.body,
		has_media: display.has_media,
		media_path: display.media_path,
		status: row.status as InboundMessage['status'],
		parsed_records: extractParsedRecords(payload),
		parse_error: extractParseError(payload),
		created_at: row.createdAt.toISOString()
	};
}
