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

/**
 * Akış satırlarında zaman: "<1dk", "12dk", "3sa", "5g", sonrası tarih.
 * Mesajlaşma ekranlarında tam tarih gürültü yapıyor; kesin değer `title`/`datetime`
 * özniteliğinde kalır (bkz. ContactTimeline).
 */
export function formatRelativeTime(iso: string, now = new Date()): string {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return '';
	const diffSec = Math.round((now.getTime() - then) / 1000);
	if (diffSec < 60) return '<1dk';
	const min = Math.floor(diffSec / 60);
	if (min < 60) return `${min}dk`;
	const hour = Math.floor(min / 60);
	if (hour < 24) return `${hour}sa`;
	const day = Math.floor(hour / 24);
	if (day < 7) return `${day}g`;
	return formatDate(iso);
}

/** Ad/soyaddan en fazla iki harflik baş harf; avatar yerine kullanılır. */
export function initialsOf(name: string | null | undefined): string {
	const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	const letters = parts.slice(0, 2).map((p) => p[0] ?? '');
	return letters.join('').toLocaleUpperCase('tr-TR');
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

/**
 * `estimated_cost_usd_micros` (1e-6 USD) → "$0.001234". Bölme yalnız burada —
 * platform LLM kullanım panelinin tek para gösterim yeri.
 */
export function formatUsdMicros(micros: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 6,
		maximumFractionDigits: 6
	}).format(micros / 1_000_000);
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
