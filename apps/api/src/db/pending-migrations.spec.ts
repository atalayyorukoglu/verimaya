import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
	slicePendingEntries,
	parseVeriMigrationMarker,
	enrichPending,
	formatPendingReport,
	exitCodeForPending
} = require('../../scripts/pending-migrations.js') as {
	slicePendingEntries: (
		entries: { tag: string }[],
		appliedCount: number
	) => { tag: string }[];
	parseVeriMigrationMarker: (sqlText: string) => string | null;
	enrichPending: (
		pendingEntries: { tag: string }[],
		readSql: (tag: string) => string
	) => { tag: string; file: string; veriNote: string | null }[];
	formatPendingReport: (
		pending: { tag: string; file: string; veriNote: string | null }[]
	) => string;
	exitCodeForPending: (
		pending: { tag: string; file: string; veriNote: string | null }[]
	) => 0 | 2;
};

describe('pending-migrations: slicePendingEntries', () => {
	const entries = [{ tag: 'a' }, { tag: 'b' }, { tag: 'c' }];

	it('returns empty when applied count >= journal length', () => {
		expect(slicePendingEntries(entries, 3)).toEqual([]);
		expect(slicePendingEntries(entries, 4)).toEqual([]);
		expect(slicePendingEntries(entries, 100)).toEqual([]);
	});

	it('returns journal[M..] when applied count M < length', () => {
		expect(slicePendingEntries(entries, 0)).toEqual(entries);
		expect(slicePendingEntries(entries, 1)).toEqual([{ tag: 'b' }, { tag: 'c' }]);
		expect(slicePendingEntries(entries, 2)).toEqual([{ tag: 'c' }]);
	});

	it('treats non-finite applied count as 0', () => {
		expect(slicePendingEntries(entries, Number.NaN)).toEqual(entries);
	});
});

describe('pending-migrations: parseVeriMigrationMarker', () => {
	it('reads marker from the first non-empty line', () => {
		const sql = `-- @veri-migration: rewrite names\nUPDATE contacts SET x = 1;\n`;
		expect(parseVeriMigrationMarker(sql)).toBe('rewrite names');
	});

	it('allows a blank line before the marker', () => {
		const sql = `\n\n-- @veri-migration: backfill emails\nALTER TABLE t ADD c int;\n`;
		expect(parseVeriMigrationMarker(sql)).toBe('backfill emails');
	});

	it('returns null when first content line is unmarked', () => {
		const sql = `-- Repair contacts\nUPDATE contacts SET x = 1;\n`;
		expect(parseVeriMigrationMarker(sql)).toBeNull();
	});

	it('returns null when marker is not at the top', () => {
		const sql = `-- preamble\n-- @veri-migration: too late\nUPDATE t SET a = 1;\n`;
		expect(parseVeriMigrationMarker(sql)).toBeNull();
	});
});

describe('pending-migrations: enrich + exit + report', () => {
	it('distinguishes marked vs unmarked pending files', () => {
		const pending = enrichPending([{ tag: '0047_data' }, { tag: '0048_schema' }], (tag) => {
			if (tag === '0047_data') {
				return '-- @veri-migration: split names\nUPDATE contacts SET a = 1;\n';
			}
			return '-- add index\nCREATE INDEX ON contacts (id);\n';
		});

		expect(pending).toEqual([
			{ tag: '0047_data', file: '0047_data.sql', veriNote: 'split names' },
			{ tag: '0048_schema', file: '0048_schema.sql', veriNote: null }
		]);
		expect(exitCodeForPending(pending)).toBe(2);

		const report = formatPendingReport(pending);
		expect(report).toContain('DİKKAT: bu deploy veri değiştirecek — önce yedek al');
		expect(report).toContain('[veri] 0047_data.sql');
		expect(report).toContain('[şema] 0048_schema.sql');
	});

	it('exit 0 when pending are schema-only or empty', () => {
		expect(exitCodeForPending([])).toBe(0);
		expect(
			exitCodeForPending([
				{ tag: 'x', file: 'x.sql', veriNote: null }
			])
		).toBe(0);

		const emptyReport = formatPendingReport([]);
		expect(emptyReport).toContain('Bekleyen migration: 0');
		expect(emptyReport).toContain("Tüm migration'lar uygulanmış.");
	});
});
