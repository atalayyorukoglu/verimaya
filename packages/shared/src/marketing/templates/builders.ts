import type { UtmParts } from './schema.js';

export function buildUtmUrl(parts: UtmParts): string {
	const url = new URL(parts.baseUrl.includes('://') ? parts.baseUrl : `https://${parts.baseUrl}`);
	url.searchParams.set('utm_campaign', parts.campaign);
	url.searchParams.set('utm_source', parts.source);
	url.searchParams.set('utm_medium', parts.medium);
	if (parts.content) url.searchParams.set('utm_content', parts.content);
	if (parts.term) url.searchParams.set('utm_term', parts.term);
	return url.toString();
}

/**
 * Classic 3:2:2 creative test split.
 * `total` is expected as minor-unit (kuruş) integer; the function is unit-agnostic.
 */
export function split322(total: number): { a: number; b: number; c: number } {
	const a = Math.round(total * (3 / 7));
	const b = Math.round(total * (2 / 7));
	const c = total - a - b;
	return { a, b, c };
}

/**
 * 60/30/10 budget allocation.
 * `budget` is expected as minor-unit (kuruş) integer; the function is unit-agnostic.
 */
export function split603010(budget: number): {
	prospecting: number;
	remarketing: number;
	testing: number;
} {
	const prospecting = Math.round(budget * 0.6);
	const remarketing = Math.round(budget * 0.3);
	const testing = budget - prospecting - remarketing;
	return { prospecting, remarketing, testing };
}
