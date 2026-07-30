#!/usr/bin/env node
/**
 * Print karne funnel stats to the terminal (no panel UI).
 *
 * Usage:
 *   pnpm --filter @verimaya/api karne:stats
 *
 * Uses DATABASE_URL_APP (preferred) or DATABASE_URL from apps/api/.env.
 */

const fs = require('node:fs');
const path = require('node:path');
const { config: loadEnv } = require('dotenv');
const postgres = require('postgres');

loadEnv({ path: path.join(__dirname, '..', '.env') });

const SQL_PATH = path.join(__dirname, 'karne-stats.sql');

const SECTION_LABELS = {
	overview: 'Overview (completion + email rate)',
	questions: 'Per-question (viewed / answered / abandon % / median dwell ms)',
	band: 'Band distribution (eksen 3)',
	eu: 'EU/UK exposure distribution (eksen 3)'
};

/**
 * @param {string} raw
 * @returns {{ name: string, sql: string }[]}
 */
function parseSections(raw) {
	const parts = raw.split(/^-- @section\s+(\w+)\s*$/m);
	/** @type {{ name: string, sql: string }[]} */
	const sections = [];
	// parts[0] is preamble before first section
	for (let i = 1; i < parts.length; i += 2) {
		const name = parts[i];
		const body = (parts[i + 1] ?? '').trim().replace(/;\s*$/, '');
		if (!name || !body) continue;
		sections.push({ name, sql: body });
	}
	return sections;
}

async function main() {
	const databaseUrl =
		process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error(
			'Missing DATABASE_URL_APP or DATABASE_URL (load apps/api/.env).'
		);
		process.exit(1);
	}

	const raw = fs.readFileSync(SQL_PATH, 'utf8');
	const sections = parseSections(raw);
	if (sections.length === 0) {
		console.error('No -- @section blocks found in karne-stats.sql');
		process.exit(1);
	}

	const sql = postgres(databaseUrl, { max: 1 });
	try {
		console.log('Karne funnel stats\n');
		for (const section of sections) {
			const label = SECTION_LABELS[section.name] ?? section.name;
			console.log(`=== ${label} ===`);
			const rows = await sql.unsafe(section.sql);
			if (!rows.length) {
				console.log('(no rows)\n');
				continue;
			}
			console.table(
				rows.map((row) => {
					/** @type {Record<string, unknown>} */
					const out = {};
					for (const [key, value] of Object.entries(row)) {
						out[key] = value === null ? '—' : value;
					}
					return out;
				})
			);
			console.log('');
		}
	} finally {
		await sql.end({ timeout: 5 });
	}
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
