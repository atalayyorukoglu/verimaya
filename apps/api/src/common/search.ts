import { ilike, or, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

function escapeIlike(value: string): string {
	return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

/**
 * Case-insensitive substring search across text columns.
 * Uses pg_trgm GIN indexes when present (patients.full_name, contacts.display_name).
 */
export function textSearchCondition(
	q: string | undefined,
	columns: PgColumn[]
): SQL | undefined {
	const trimmed = q?.trim();
	if (!trimmed || columns.length === 0) return undefined;

	const pattern = `%${escapeIlike(trimmed)}%`;
	const conditions = columns.map((col) => ilike(col, pattern));
	return conditions.length === 1 ? conditions[0] : or(...conditions);
}
