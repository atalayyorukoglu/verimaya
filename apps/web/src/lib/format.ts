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

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Ratio as multiplier, e.g. 1.749 → "1,75×". Non-finite → "—". */
export function formatRatio(value: number): string {
	if (!Number.isFinite(value)) return '—';
	return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(value)}×`;
}

/** Fraction as percent, e.g. 0.53 → "53,0%". Non-finite → "—". */
export function formatPercent(fraction: number, digits = 1): string {
	if (!Number.isFinite(fraction)) return '—';
	return new Intl.NumberFormat('tr-TR', {
		style: 'percent',
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	}).format(fraction);
}

/**
 * TL metnini kuruş integer'a çevirir.
 * "1.000,50" / "1000.5" → 100050; boş veya geçersiz → null.
 */
export function parseMoneyInput(value: string): number | null {
	const raw = value.trim().replace(/\s/g, '');
	if (!raw) return null;

	let normalized = raw;
	const lastComma = raw.lastIndexOf(',');
	const lastDot = raw.lastIndexOf('.');

	if (lastComma !== -1 && lastDot !== -1) {
		if (lastComma > lastDot) {
			normalized = raw.replace(/\./g, '').replace(',', '.');
		} else {
			normalized = raw.replace(/,/g, '');
		}
	} else if (lastComma !== -1) {
		normalized = raw.replace(',', '.');
	} else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
		normalized = raw.replace(/\./g, '');
	}

	const tl = Number(normalized);
	if (!Number.isFinite(tl)) return null;
	return Math.round(tl * 100);
}

export function isSameLocalDay(iso: string, day = new Date()): boolean {
	const d = new Date(iso);
	return (
		d.getFullYear() === day.getFullYear() &&
		d.getMonth() === day.getMonth() &&
		d.getDate() === day.getDate()
	);
}
