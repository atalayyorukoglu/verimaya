import { and, eq, gt, lt, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import {
	decodeContactListCursor,
	decodeCursor,
	decodeOccurredOnCursor,
	encodeContactListCursor,
	encodeCursor,
	encodeOccurredOnCursor
} from './pagination';

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

/** Transactions list: `occurred_on DESC, id DESC` cursor window. */
export function occurredOnCursorCondition(
	occurredOnCol: PgColumn,
	idCol: PgColumn,
	cursor?: string
): SQL | undefined {
	if (!cursor) return undefined;
	const decoded = decodeOccurredOnCursor(cursor);
	if (!decoded) return undefined;
	return or(
		lt(occurredOnCol, decoded.occurredOn),
		and(eq(occurredOnCol, decoded.occurredOn), lt(idCol, decoded.id))
	);
}

export function buildOccurredOnCursorPage<T extends { id: string; occurredOn: string }>(
	rows: T[],
	limit: number
): { items: T[]; next_cursor: string | null } {
	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const last = items.at(-1);
	const next_cursor =
		hasMore && last ? encodeOccurredOnCursor(last.occurredOn, last.id) : null;
	return { items, next_cursor };
}

/**
 * Contacts list: `last_name ASC NULLS LAST, first_name ASC NULLS LAST, id ASC`.
 * Keyset window after the decoded cursor row (PostgreSQL ASC nulls-last semantics).
 */
export function contactListCursorCondition(
	sortLastNameCol: SQL<string | null>,
	sortFirstNameCol: SQL<string | null>,
	idCol: PgColumn,
	cursor?: string
): SQL | undefined {
	if (!cursor) return undefined;
	const decoded = decodeContactListCursor(cursor);
	if (!decoded) return undefined;

	const { lastName, firstName, id } = decoded;

	const afterFirstName = (): SQL => {
		if (firstName === null) {
			return sql`(${sortFirstNameCol} IS NULL AND ${idCol} > ${id})`;
		}
		return sql`(
			${sortFirstNameCol} > ${firstName}
			OR (${sortFirstNameCol} = ${firstName} AND ${idCol} > ${id})
			OR ${sortFirstNameCol} IS NULL
		)`;
	};

	if (lastName === null) {
		return sql`(${sortLastNameCol} IS NULL AND ${afterFirstName()})`;
	}

	return sql`(
		${sortLastNameCol} > ${lastName}
		OR (${sortLastNameCol} = ${lastName} AND ${afterFirstName()})
		OR ${sortLastNameCol} IS NULL
	)`;
}

export function buildContactListCursorPage<
	T extends {
		id: string;
		sort_last_name: string | null;
		sort_first_name: string | null;
	}
>(rows: T[], limit: number): { items: T[]; next_cursor: string | null } {
	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const last = items.at(-1);
	const next_cursor =
		hasMore && last
			? encodeContactListCursor(last.sort_last_name, last.sort_first_name, last.id)
			: null;
	return { items, next_cursor };
}

/**
 * Incentive files: `deadline_at ASC, id ASC`.
 * Reuses the YYYY-MM-DD|id cursor encoding from occurred_on.
 */
export function deadlineAtCursorCondition(
	deadlineAtCol: PgColumn,
	idCol: PgColumn,
	cursor?: string
): SQL | undefined {
	if (!cursor) return undefined;
	const decoded = decodeOccurredOnCursor(cursor);
	if (!decoded) return undefined;
	return or(
		gt(deadlineAtCol, decoded.occurredOn),
		and(eq(deadlineAtCol, decoded.occurredOn), gt(idCol, decoded.id))
	);
}

export function buildDeadlineAtCursorPage<T extends { id: string; deadlineAt: string }>(
	rows: T[],
	limit: number
): { items: T[]; next_cursor: string | null } {
	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const last = items.at(-1);
	const next_cursor =
		hasMore && last ? encodeOccurredOnCursor(last.deadlineAt, last.id) : null;
	return { items, next_cursor };
}

/**
 * Operation alerts: `due_at ASC, id ASC`.
 * Reuses ISO-datetime|id cursor encoding from created_at.
 */
export function dueAtCursorCondition(
	dueAtCol: PgColumn,
	idCol: PgColumn,
	cursor?: string
): SQL | undefined {
	if (!cursor) return undefined;
	const decoded = decodeCursor(cursor);
	if (!decoded) return undefined;
	return or(
		gt(dueAtCol, decoded.createdAt),
		and(eq(dueAtCol, decoded.createdAt), gt(idCol, decoded.id))
	);
}

export function buildDueAtCursorPage<T extends { id: string; dueAt: Date }>(
	rows: T[],
	limit: number
): { items: T[]; next_cursor: string | null } {
	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const last = items.at(-1);
	const next_cursor = hasMore && last ? encodeCursor(last.dueAt, last.id) : null;
	return { items, next_cursor };
}
