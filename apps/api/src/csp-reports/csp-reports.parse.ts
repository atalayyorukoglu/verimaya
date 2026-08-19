export const CSP_REPORT_MAX_BYTES = 8 * 1024;
export const CSP_URI_MAX_LENGTH = 1000;
export const CSP_DIRECTIVE_MAX_LENGTH = 200;

/** Coarse UA family only — never store the raw User-Agent string. */
export function userAgentFamily(ua: string | undefined): string | null {
	if (!ua) return null;
	const lower = ua.toLowerCase();
	if (lower.includes('edg/')) return 'edge';
	if (lower.includes('chrome/') || lower.includes('crios/')) return 'chrome';
	if (lower.includes('firefox/') || lower.includes('fxios/')) return 'firefox';
	if (lower.includes('safari/') && !lower.includes('chrome')) return 'safari';
	if (lower.includes('opera') || lower.includes('opr/')) return 'opera';
	return 'other';
}

/**
 * Keep origin + path. Drop query string and fragment so tokens / PII in
 * `blocked_uri` never land in the table.
 */
export function stripUriSecrets(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return '';
	try {
		const parsed = new URL(trimmed);
		return `${parsed.origin}${parsed.pathname}`.slice(0, CSP_URI_MAX_LENGTH);
	} catch {
		const withoutFragment = trimmed.split('#')[0] ?? '';
		const withoutQuery = withoutFragment.split('?')[0] ?? '';
		return withoutQuery.slice(0, CSP_URI_MAX_LENGTH);
	}
}

export type NormalizedCspReport = {
	documentUri: string;
	blockedUri: string;
	violatedDirective: string;
	effectiveDirective: string | null;
	disposition: string | null;
};

function asString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function fromFields(fields: Record<string, unknown>): NormalizedCspReport | null {
	const documentUri = stripUriSecrets(
		asString(
			fields['document-uri'] ??
				fields.documentURI ??
				fields.documentURL ??
				fields.documentUri ??
				fields['document-url']
		)
	);
	const blockedRaw = asString(
		fields['blocked-uri'] ??
			fields.blockedURI ??
			fields.blockedURL ??
			fields.blockedUri ??
			fields['blocked-url']
	);
	const blockedUri = stripUriSecrets(blockedRaw || 'inline');
	const violatedDirective = asString(
		fields['violated-directive'] ?? fields.violatedDirective
	).slice(0, CSP_DIRECTIVE_MAX_LENGTH);
	const effectiveDirective =
		asString(fields['effective-directive'] ?? fields.effectiveDirective).slice(
			0,
			CSP_DIRECTIVE_MAX_LENGTH
		) || null;
	const disposition = asString(fields.disposition).slice(0, 32) || null;

	if (!documentUri || !violatedDirective) return null;
	return { documentUri, blockedUri, violatedDirective, effectiveDirective, disposition };
}

function fromLegacyOrBody(value: unknown): NormalizedCspReport | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const rec = value as Record<string, unknown>;
	if (rec['csp-report'] && typeof rec['csp-report'] === 'object') {
		return fromFields(rec['csp-report'] as Record<string, unknown>);
	}
	if (rec.body && typeof rec.body === 'object') {
		const nested = fromFields(rec.body as Record<string, unknown>);
		if (nested) return nested;
	}
	return fromFields(rec);
}

/** Returns null for empty / unrecognized payloads — caller must 204 and drop. */
export function normalizeCspReportBody(body: unknown): NormalizedCspReport | null {
	if (body == null) return null;
	if (typeof body === 'string') {
		const trimmed = body.trim();
		if (!trimmed) return null;
		try {
			return normalizeCspReportBody(JSON.parse(trimmed) as unknown);
		} catch {
			return null;
		}
	}
	if (Array.isArray(body)) {
		for (const item of body) {
			if (!item || typeof item !== 'object') continue;
			const rec = item as Record<string, unknown>;
			if (typeof rec.type === 'string' && rec.type !== 'csp-violation') continue;
			const normalized = fromLegacyOrBody(item);
			if (normalized) return normalized;
		}
		return null;
	}
	return fromLegacyOrBody(body);
}
