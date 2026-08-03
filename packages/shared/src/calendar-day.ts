/**
 * Tenant-timezone calendar-day helpers (TIME-01).
 * Uses Intl.DateTimeFormat only — no external TZ libraries.
 */

function parseDayKey(dayKey: string): { year: number; month: number; day: number } {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
	if (!match) {
		throw new Error(`Invalid day key: ${dayKey}`);
	}
	return {
		year: Number(match[1]),
		month: Number(match[2]),
		day: Number(match[3])
	};
}

function addCalendarDays(year: number, month: number, day: number, days: number) {
	const dt = new Date(Date.UTC(year, month - 1, day + days));
	return {
		year: dt.getUTCFullYear(),
		month: dt.getUTCMonth() + 1,
		day: dt.getUTCDate()
	};
}

/** Map a local wall-clock in `timeZone` to the corresponding UTC instant. */
function zonedLocalToUtc(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	second: number,
	timeZone: string
): Date {
	const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
	let utcMs = desiredAsUtc;

	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});

	for (let i = 0; i < 4; i++) {
		const parts = formatter.formatToParts(new Date(utcMs));
		const get = (type: Intl.DateTimeFormatPartTypes) =>
			Number(parts.find((p) => p.type === type)?.value ?? '0');

		const actualAsUtc = Date.UTC(
			get('year'),
			get('month') - 1,
			get('day'),
			get('hour') % 24,
			get('minute'),
			get('second')
		);
		const diff = desiredAsUtc - actualAsUtc;
		if (diff === 0) break;
		utcMs += diff;
	}

	return new Date(utcMs);
}

/** Calendar date YYYY-MM-DD for `date` interpreted in `timeZone`. */
export function toTenantDayKey(date: Date, timeZone: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(date);
}

/** UTC half-open range [start, endExclusive) for one tenant calendar day. */
export function tenantDayRange(
	dayKey: string,
	timeZone: string
): { start: Date; endExclusive: Date } {
	const { year, month, day } = parseDayKey(dayKey);
	const start = zonedLocalToUtc(year, month, day, 0, 0, 0, timeZone);
	const next = addCalendarDays(year, month, day, 1);
	const endExclusive = zonedLocalToUtc(next.year, next.month, next.day, 0, 0, 0, timeZone);
	return { start, endExclusive };
}
