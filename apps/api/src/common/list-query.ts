import { and, eq, lt, or, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { decodeCursor, encodeCursor } from './pagination';

export function createdAtCursorCondition(
	createdAtCol: PgColumn,
	idCol: PgColumn,
	cursor?: string
): SQL | undefined {
	if (!cursor) return undefined;
	const decoded = decodeCursor(cursor);
	if (!decoded) return undefined;
	return or(
		lt(createdAtCol, decoded.createdAt),
		and(eq(createdAtCol, decoded.createdAt), lt(idCol, decoded.id))
	);
}

export function buildCursorPage<T extends { id: string; createdAt: Date }>(
	rows: T[],
	limit: number
): { items: T[]; next_cursor: string | null } {
	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const last = items.at(-1);
	const next_cursor =
		hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
	return { items, next_cursor };
}
