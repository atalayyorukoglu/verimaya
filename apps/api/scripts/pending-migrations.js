#!/usr/bin/env node
/**
 * List pending Drizzle migrations vs drizzle.__drizzle_migrations (visibility only).
 * Does not run migrations.
 *
 * Usage:
 *   pnpm --filter @verimaya/api migrate:pending
 *
 * Env:
 *   DATABASE_URL  Owner Postgres (same as db:migrate)
 *
 * Exit:
 *   0  no pending, or only unmarked (schema) migrations pending
 *   2  at least one pending file marked -- @veri-migration:
 *   1  error (missing env, DB, journal, …)
 */

const fs = require('node:fs');
const path = require('node:path');
const { config: loadEnv } = require('dotenv');
const postgres = require('postgres');

loadEnv({ path: path.join(__dirname, '..', '.env') });

const DRIZZLE_DIR = path.join(__dirname, '..', 'drizzle');
const JOURNAL_PATH = path.join(DRIZZLE_DIR, 'meta', '_journal.json');
const VERI_MARKER_RE = /^--\s*@veri-migration:\s*(.+)$/;

/**
 * @typedef {{ idx?: number, version?: string, when?: number, tag: string, breakpoints?: boolean }} JournalEntry
 * @typedef {{ tag: string, file: string, veriNote: string | null }} PendingMigration
 */

/**
 * Applied count M → pending = journal entries from index M onward (Drizzle applies in order).
 * @param {JournalEntry[]} entries
 * @param {number} appliedCount
 * @returns {JournalEntry[]}
 */
function slicePendingEntries(entries, appliedCount) {
	const m = Number.isFinite(appliedCount) ? Math.max(0, Math.floor(appliedCount)) : 0;
	if (m >= entries.length) return [];
	return entries.slice(m);
}

/**
 * Marker must appear at the top of the SQL file (first non-empty lines).
 * @param {string} sqlText
 * @returns {string | null} note text, or null if unmarked
 */
function parseVeriMigrationMarker(sqlText) {
	const lines = sqlText.split(/\r?\n/);
	for (let i = 0; i < Math.min(lines.length, 8); i++) {
		const line = lines[i].trimEnd();
		if (line.trim() === '') continue;
		const match = line.match(VERI_MARKER_RE);
		if (match) return match[1].trim();
		// First non-empty line is not the marker → unmarked
		return null;
	}
	return null;
}

/**
 * @param {JournalEntry[]} pendingEntries
 * @param {(tag: string) => string} readSql
 * @returns {PendingMigration[]}
 */
function enrichPending(pendingEntries, readSql) {
	return pendingEntries.map((entry) => {
		const file = `${entry.tag}.sql`;
		const sqlText = readSql(entry.tag);
		return {
			tag: entry.tag,
			file,
			veriNote: parseVeriMigrationMarker(sqlText)
		};
	});
}

/**
 * @param {PendingMigration[]} pending
 * @returns {string}
 */
function formatPendingReport(pending) {
	const lines = [];
	const veri = pending.filter((p) => p.veriNote !== null);

	if (veri.length > 0) {
		lines.push('============================================================');
		lines.push('DİKKAT: bu deploy veri değiştirecek — önce yedek al');
		for (const p of veri) {
			lines.push(`  - ${p.file}: ${p.veriNote}`);
		}
		lines.push('============================================================');
		lines.push('');
	}

	lines.push(`Bekleyen migration: ${pending.length}`);
	if (pending.length === 0) {
		lines.push('Tüm migration\'lar uygulanmış.');
	} else {
		for (const p of pending) {
			if (p.veriNote !== null) {
				lines.push(`  [veri] ${p.file} — ${p.veriNote}`);
			} else {
				lines.push(`  [şema] ${p.file}`);
			}
		}
	}
	return lines.join('\n');
}

/**
 * @param {PendingMigration[]} pending
 * @returns {0 | 2}
 */
function exitCodeForPending(pending) {
	return pending.some((p) => p.veriNote !== null) ? 2 : 0;
}

/**
 * @param {string} journalPath
 * @returns {JournalEntry[]}
 */
function loadJournalEntries(journalPath) {
	const raw = fs.readFileSync(journalPath, 'utf8');
	const journal = JSON.parse(raw);
	if (!journal || !Array.isArray(journal.entries)) {
		throw new Error(`Invalid journal: ${journalPath}`);
	}
	return journal.entries;
}

/**
 * @param {string} drizzleDir
 * @param {string} tag
 * @returns {string}
 */
function readMigrationSql(drizzleDir, tag) {
	const filePath = path.join(drizzleDir, `${tag}.sql`);
	return fs.readFileSync(filePath, 'utf8');
}

async function countAppliedMigrations(sql) {
	const rows = await sql`
		select count(*)::int as count
		from drizzle.__drizzle_migrations
	`;
	return rows[0]?.count ?? 0;
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error('DATABASE_URL is required');
		process.exit(1);
	}

	let entries;
	try {
		entries = loadJournalEntries(JOURNAL_PATH);
	} catch (err) {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	}

	const sql = postgres(databaseUrl, { max: 1 });
	let appliedCount;
	try {
		appliedCount = await countAppliedMigrations(sql);
	} catch (err) {
		console.error(
			'Failed to read drizzle.__drizzle_migrations:',
			err instanceof Error ? err.message : err
		);
		process.exit(1);
	} finally {
		await sql.end({ timeout: 5 });
	}

	const pendingEntries = slicePendingEntries(entries, appliedCount);
	const pending = enrichPending(pendingEntries, (tag) => readMigrationSql(DRIZZLE_DIR, tag));

	console.log(formatPendingReport(pending));
	console.log('');
	console.log(`Uygulanmış: ${appliedCount} / journal: ${entries.length}`);

	process.exit(exitCodeForPending(pending));
}

if (require.main === module) {
	main().catch((err) => {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	});
}

module.exports = {
	slicePendingEntries,
	parseVeriMigrationMarker,
	enrichPending,
	formatPendingReport,
	exitCodeForPending,
	loadJournalEntries,
	VERI_MARKER_RE
};
