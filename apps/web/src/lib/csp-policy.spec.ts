import { describe, expect, it } from 'vitest';
import { cspHintKey, cspModeFromHeaders, parseCspHeader } from './csp-policy';

describe('parseCspHeader', () => {
	it('splits one directive per line', () => {
		const lines = parseCspHeader(
			"default-src 'self'; img-src 'self' data: https:; frame-ancestors 'none'"
		);
		expect(lines).toEqual([
			{ name: 'default-src', value: "'self'" },
			{ name: 'img-src', value: "'self' data: https:" },
			{ name: 'frame-ancestors', value: "'none'" }
		]);
	});
});

describe('cspModeFromHeaders', () => {
	it('prefers report-only over enforcing', () => {
		expect(cspModeFromHeaders("default-src 'self'", "script-src 'none'").mode).toBe('report-only');
		expect(cspModeFromHeaders(null, "script-src 'self'").mode).toBe('enforcing');
		expect(cspModeFromHeaders(null, null).mode).toBe('missing');
	});
});

describe('cspHintKey', () => {
	it('maps known directives and falls back', () => {
		expect(cspHintKey('img-src')).toBe('dev.csp.hint.img-src');
		expect(cspHintKey('made-up')).toBe('dev.csp.hint.other');
	});
});
