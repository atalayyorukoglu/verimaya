import type { BannedTerm, ComplianceHit, ComplianceScanResult } from './schema.js';

/** Default health-tourism / ads sensitive terms (TR+EN sample). */
export const DEFAULT_BANNED_TERMS: BannedTerm[] = [
	{ term: 'garanti iyileşme', severity: 'block' },
	{ term: 'kesin sonuç', severity: 'block' },
	{ term: 'mucize', severity: 'warn' },
	{ term: 'guarantee cure', severity: 'block' },
	{ term: '100% success', severity: 'block' },
	{ term: 'miracle', severity: 'warn' }
];

export function scanLandingCopy(
	text: string,
	terms: BannedTerm[] = DEFAULT_BANNED_TERMS
): ComplianceScanResult {
	const lower = text.toLowerCase();
	const hits: ComplianceHit[] = [];
	for (const { term, severity } of terms) {
		const needle = term.toLowerCase();
		let from = 0;
		while (from < lower.length) {
			const index = lower.indexOf(needle, from);
			if (index === -1) break;
			hits.push({ term, index, severity });
			from = index + needle.length;
		}
	}
	hits.sort((a, b) => a.index - b.index);
	const ok = !hits.some((h) => h.severity === 'block');
	return { ok, hits };
}
