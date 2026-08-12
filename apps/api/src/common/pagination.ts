export function encodeCursor(createdAt: Date, id: string): string {
	return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
	try {
		const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
		const separator = decoded.lastIndexOf('|');
		if (separator <= 0) return null;
		const iso = decoded.slice(0, separator);
		const id = decoded.slice(separator + 1);
		const createdAt = new Date(iso);
		if (Number.isNaN(createdAt.getTime()) || !id) return null;
		return { createdAt, id };
	} catch {
		return null;
	}
}

/** Business-date cursor for transactions (`occurred_on` YYYY-MM-DD + id). */
export function encodeOccurredOnCursor(occurredOn: string, id: string): string {
	return Buffer.from(`${occurredOn}|${id}`).toString('base64url');
}

export function decodeOccurredOnCursor(
	cursor: string
): { occurredOn: string; id: string } | null {
	try {
		const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
		const separator = decoded.lastIndexOf('|');
		if (separator <= 0) return null;
		const occurredOn = decoded.slice(0, separator);
		const id = decoded.slice(separator + 1);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) || !id) return null;
		return { occurredOn, id };
	} catch {
		return null;
	}
}

/**
 * Contacts list cursor (`last_name ASC NULLS LAST, first_name ASC NULLS LAST, id ASC`).
 * JSON payload so names may contain `|`.
 */
export function encodeContactListCursor(
	lastName: string | null,
	firstName: string | null,
	id: string
): string {
	return Buffer.from(JSON.stringify({ l: lastName, f: firstName, i: id }), 'utf8').toString(
		'base64url'
	);
}

export function decodeContactListCursor(
	cursor: string
): { lastName: string | null; firstName: string | null; id: string } | null {
	try {
		const raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
			l?: unknown;
			f?: unknown;
			i?: unknown;
		};
		if (typeof raw.i !== 'string' || !raw.i) return null;
		if (!(raw.l === null || typeof raw.l === 'string')) return null;
		if (!(raw.f === null || typeof raw.f === 'string')) return null;
		return { lastName: raw.l, firstName: raw.f, id: raw.i };
	} catch {
		return null;
	}
}

export function toIsoDateTime(value: Date): string {
	return value.toISOString();
}
