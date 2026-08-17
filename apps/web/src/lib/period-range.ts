import { toTenantDayKey } from '@verimaya/shared';

export type PeriodKey = 'bu-ay' | 'gecen-ay' | 'tum' | 'ozel';

export type DateRange = { from: string | null; to: string | null };

export function monthRangeInTz(
	offsetMonths: number,
	timeZone: string
): { from: string; to: string } {
	const todayKey = toTenantDayKey(new Date(), timeZone);
	const [year, month] = todayKey.split('-').map(Number);
	let targetYear = year;
	let targetMonth = month + offsetMonths;
	while (targetMonth < 1) {
		targetMonth += 12;
		targetYear--;
	}
	while (targetMonth > 12) {
		targetMonth -= 12;
		targetYear++;
	}
	const from = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
	const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
	const to = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
	return { from, to };
}

/** Inclusive last N calendar months ending this month (e.g. 12 → son 12 ay). */
export function lastMonthsRange(
	monthCount: number,
	timeZone: string
): { from: string; to: string } {
	const end = monthRangeInTz(0, timeZone);
	const start = monthRangeInTz(-(monthCount - 1), timeZone);
	return { from: start.from, to: end.to };
}

export function resolvePeriodRange(
	periodKey: PeriodKey,
	customFrom: string,
	customTo: string,
	timeZone: string
): DateRange {
	if (periodKey === 'bu-ay') return monthRangeInTz(0, timeZone);
	if (periodKey === 'gecen-ay') return monthRangeInTz(-1, timeZone);
	if (periodKey === 'ozel') return { from: customFrom, to: customTo };
	return { from: null, to: null };
}

export function periodLabel(
	key: PeriodKey,
	from: string,
	to: string,
	allTimeLabel: string
): string {
	if (key === 'bu-ay') {
		const d = new Date();
		return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(d);
	}
	if (key === 'gecen-ay') {
		const d = new Date();
		d.setMonth(d.getMonth() - 1);
		return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(d);
	}
	if (key === 'tum') return allTimeLabel;
	return `${from} → ${to}`;
}

export function dayKeyToDate(dayKey: string): Date {
	const [year, month, day] = dayKey.split('-').map(Number);
	return new Date(year, month - 1, day);
}
