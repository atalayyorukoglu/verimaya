import type { MessageKey } from '$lib/i18n/messages';

export type CspDirectiveLine = {
	name: string;
	value: string;
};

export type CspPolicyMode = 'report-only' | 'enforcing' | 'missing';

export function parseCspHeader(header: string): CspDirectiveLine[] {
	return header
		.split(';')
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			const space = part.indexOf(' ');
			if (space < 0) return { name: part, value: '' };
			return { name: part.slice(0, space), value: part.slice(space + 1).trim() };
		});
}

export function cspModeFromHeaders(
	reportOnly: string | null,
	enforcing: string | null
): { mode: CspPolicyMode; header: string | null } {
	if (reportOnly && reportOnly.trim()) {
		return { mode: 'report-only', header: reportOnly };
	}
	if (enforcing && enforcing.trim()) {
		return { mode: 'enforcing', header: enforcing };
	}
	return { mode: 'missing', header: null };
}

export function cspHintKey(directive: string): MessageKey {
	switch (directive) {
		case 'default-src':
		case 'base-uri':
		case 'form-action':
		case 'frame-ancestors':
		case 'script-src':
		case 'style-src':
		case 'img-src':
		case 'font-src':
		case 'connect-src':
		case 'worker-src':
		case 'report-uri':
		case 'report-to':
			return `dev.csp.hint.${directive}`;
		default:
			return 'dev.csp.hint.other';
	}
}
