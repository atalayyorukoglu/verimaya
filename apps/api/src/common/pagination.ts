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

export function toIsoDateTime(value: Date): string {
	return value.toISOString();
}
