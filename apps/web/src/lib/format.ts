const moneyFmtCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(amountMinor: number, currency = 'TRY'): string {
	let fmt = moneyFmtCache.get(currency);
	if (!fmt) {
		fmt = new Intl.NumberFormat('tr-TR', {
			style: 'currency',
			currency,
			minimumFractionDigits: 2
		});
		moneyFmtCache.set(currency, fmt);
	}
	return fmt.format(amountMinor / 100);
}

export function formatDate(iso: string): string {
	return new Intl.DateTimeFormat('tr-TR', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
	return new Intl.DateTimeFormat('tr-TR', {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	}).format(new Date(iso));
}

export function formatTime(iso: string): string {
	return new Intl.DateTimeFormat('tr-TR', {
		hour: '2-digit',
		minute: '2-digit'
	}).format(new Date(iso));
}

export function isSameLocalDay(iso: string, day = new Date()): boolean {
	const d = new Date(iso);
	return (
		d.getFullYear() === day.getFullYear() &&
		d.getMonth() === day.getMonth() &&
		d.getDate() === day.getDate()
	);
}
