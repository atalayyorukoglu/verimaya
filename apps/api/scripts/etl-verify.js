#!/usr/bin/env node
/**
 * Fixrav Tracker → Verimaya ETL verification (Adım 30).
 *
 * Compares source (fixture or TRACKER_DATABASE_URL) expected counts / money checksums
 * against a Verimaya tenant under RLS. Exit 1 if any check fails.
 *
 * Usage:
 *   pnpm --filter @verimaya/api etl:verify -- --tenant-id <uuid>
 *   pnpm --filter @verimaya/api etl:verify -- --tenant-id <uuid> --fixture ./fixtures/etl-sample.json
 *   TRACKER_DATABASE_URL=… pnpm --filter @verimaya/api etl:verify -- \
 *     --tenant-id <uuid> --tracker-tenant-id <uuid>
 */

const path = require('node:path');
const { config: loadEnv } = require('dotenv');
const postgres = require('postgres');
const {
	DEFAULT_FIXTURE,
	SOURCE,
	loadFixtureFile,
	loadFromTracker,
	mapFixture,
	attachContactLegacy,
	toMinor,
	parseArgs: parseEtlArgs
} = require('./etl.js');

loadEnv({ path: path.join(__dirname, '..', '.env') });

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
	const base = parseEtlArgs(argv);
	return {
		fixture: base.fixture,
		tenantId: base.tenantId,
		trackerTenantId: base.trackerTenantId,
		help: base.help
	};
}

function printHelp() {
	console.log(`Usage: pnpm --filter @verimaya/api etl:verify -- --tenant-id <uuid> [options]

Options:
  --tenant-id <uuid>         Verimaya tenant (required)
  --fixture <path>           Source JSON (default: fixtures/etl-sample.json)
  --tracker-tenant-id <uuid> With TRACKER_DATABASE_URL: live Tracker source
  --help

Env:
  DATABASE_URL_APP           Verimaya app role (RLS)
  TRACKER_DATABASE_URL       Optional Tracker Postgres (read-only)
`);
}

/**
 * @param {ReturnType<typeof mapFixture>} mapped
 */
function expectedFromMapped(mapped) {
	const incomeMinor = mapped.transactions
		.filter((t) => t.verimaya.kind === 'income' && t.verimaya.amount != null)
		.reduce((s, t) => s + /** @type {number} */ (t.verimaya.amount), 0);
	const expenseMinor = mapped.transactions
		.filter((t) => t.verimaya.kind === 'expense' && t.verimaya.amount != null)
		.reduce((s, t) => s + /** @type {number} */ (t.verimaya.amount), 0);

	const sampleTx = mapped.transactions
		.filter((t) => t.verimaya.amount != null)
		.slice(0, 5)
		.map((t) => ({
			legacy_id: t.legacy_id,
			title: t.verimaya.title,
			amount_minor: t.verimaya.amount,
			currency: t.verimaya.currency
		}));

	return {
		counts: {
			// Cases land as Hasta contacts; total contacts = parties + patients.
			contacts: mapped.contacts.length + mapped.patients.length,
			patients: mapped.patients.length,
			appointments: mapped.appointments.filter((a) => a._case_legacy).length,
			transactions: mapped.transactions.filter((t) => t.verimaya.amount != null).length,
			files: mapped.files.filter((f) => f._case_legacy).length,
			case_notes: mapped.case_notes.filter((n) => n._case_legacy).length
		},
		money: {
			income_minor: incomeMinor,
			expense_minor: expenseMinor,
			net_minor: incomeMinor - expenseMinor,
			transaction_count: mapped.transactions.filter((t) => t.verimaya.amount != null).length
		},
		sample_transactions: sampleTx,
		duplicates: expectedDuplicatesFromMapped(mapped)
	};
}

/**
 * Source may already contain duplicate emails/phones; verify expects the same groups after ETL.
 * @param {ReturnType<typeof mapFixture>} mapped
 */
function expectedDuplicatesFromMapped(mapped) {
	/** @type {Map<string, number>} */
	const patientEmail = new Map();
	/** @type {Map<string, number>} */
	const patientPhone = new Map();
	/** @type {Map<string, number>} */
	const contactEmail = new Map();

	for (const p of mapped.patients) {
		const email = p.verimaya.email ? String(p.verimaya.email).trim().toLowerCase() : '';
		if (email) patientEmail.set(email, (patientEmail.get(email) ?? 0) + 1);
		const phone = p.verimaya.phone
			? String(p.verimaya.phone).replace(/\D/g, '')
			: '';
		if (phone.length >= 7) patientPhone.set(phone, (patientPhone.get(phone) ?? 0) + 1);
	}
	for (const c of mapped.contacts) {
		const email = c.verimaya.email ? String(c.verimaya.email).trim().toLowerCase() : '';
		if (email) contactEmail.set(email, (contactEmail.get(email) ?? 0) + 1);
	}

	const toGroups = (/** @type {Map<string, number>} */ m) =>
		[...m.entries()]
			.filter(([, n]) => n > 1)
			.map(([key, n]) => ({ key, n }))
			.sort((a, b) => a.key.localeCompare(b.key));

	return {
		patient_email: toGroups(patientEmail),
		patient_phone: toGroups(patientPhone),
		contact_email: toGroups(contactEmail)
	};
}

/**
 * @param {import('postgres').Sql} sql
 * @param {string} tenantId
 */
async function actualFromTenant(sql, tenantId) {
	return sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;

		const [contacts] = await tx`select count(*)::int as n from contacts where deleted_at is null`;
		const [patients] = await tx`
			select count(*)::int as n from contacts
			where deleted_at is null and contact_type_name = 'Hasta'
		`;
		const [appointments] = await tx`select count(*)::int as n from appointments`;
		const [transactions] = await tx`select count(*)::int as n from transactions`;
		const [files] = await tx`select count(*)::int as n from files`;
		const [caseNotes] = await tx`select count(*)::int as n from case_notes`;
		const [external] = await tx`
			select count(*)::int as n from external_ids where source = ${SOURCE}
		`;

		const [money] = await tx`
			select
				coalesce(sum(case when kind = 'income' then amount else 0 end), 0)::bigint as income_minor,
				coalesce(sum(case when kind = 'expense' then amount else 0 end), 0)::bigint as expense_minor,
				count(*)::int as transaction_count
			from transactions
		`;

		const samples = await tx`
			select title, amount, currency
			from transactions
			order by occurred_on, title
			limit 8
		`;

		const patientEmailDupes = await tx`
			select lower(email) as key, count(*)::int as n
			from contacts
			where deleted_at is null and contact_type_name = 'Hasta'
				and email is not null and email <> ''
			group by lower(email)
			having count(*) > 1
		`;
		const patientPhoneDupes = await tx`
			select regexp_replace(phone, '\\D', '', 'g') as key, count(*)::int as n
			from contacts
			where deleted_at is null and contact_type_name = 'Hasta'
				and phone is not null and phone <> ''
			group by regexp_replace(phone, '\\D', '', 'g')
			having count(*) > 1 and length(regexp_replace(phone, '\\D', '', 'g')) >= 7
		`;
		const contactEmailDupes = await tx`
			select lower(email) as key, count(*)::int as n
			from contacts
			where deleted_at is null and contact_type_name <> 'Hasta'
				and email is not null and email <> ''
			group by lower(email)
			having count(*) > 1
		`;

		const income = Number(money.income_minor);
		const expense = Number(money.expense_minor);

		return {
			counts: {
				contacts: contacts.n,
				patients: patients.n,
				appointments: appointments.n,
				transactions: transactions.n,
				files: files.n,
				case_notes: caseNotes.n,
				external_ids: external.n
			},
			money: {
				income_minor: income,
				expense_minor: expense,
				net_minor: income - expense,
				transaction_count: money.transaction_count
			},
			sample_transactions: samples.map((r) => ({
				title: r.title,
				amount_minor: r.amount,
				currency: r.currency
			})),
			duplicates: {
				patient_email: patientEmailDupes.map((r) => ({ key: r.key, n: r.n })),
				patient_phone: patientPhoneDupes.map((r) => ({ key: r.key, n: r.n })),
				contact_email: contactEmailDupes.map((r) => ({ key: r.key, n: r.n }))
			}
		};
	});
}

/**
 * @param {{ expected: ReturnType<typeof expectedFromMapped>, actual: Awaited<ReturnType<typeof actualFromTenant>> }} input
 */
function buildDiffs(input) {
	/** @type {{ check: string, expected: unknown, actual: unknown, ok: boolean }[]} */
	const rows = [];
	const { expected, actual } = input;

	for (const key of Object.keys(expected.counts)) {
		const exp = expected.counts[/** @type {keyof typeof expected.counts} */ (key)];
		const act = actual.counts[/** @type {keyof typeof actual.counts} */ (key)];
		rows.push({
			check: `count.${key}`,
			expected: exp,
			actual: act,
			ok: exp === act
		});
	}

	const expectedExternal =
		expected.counts.contacts +
		expected.counts.appointments +
		expected.counts.transactions +
		expected.counts.files +
		expected.counts.case_notes;
	rows.push({
		check: 'count.external_ids',
		expected: expectedExternal,
		actual: actual.counts.external_ids,
		ok: expectedExternal === actual.counts.external_ids
	});

	for (const key of ['income_minor', 'expense_minor', 'net_minor', 'transaction_count']) {
		const exp = expected.money[/** @type {keyof typeof expected.money} */ (key)];
		const act = actual.money[/** @type {keyof typeof actual.money} */ (key)];
		rows.push({
			check: `money.${key}`,
			expected: exp,
			actual: act,
			ok: exp === act
		});
	}

	const dupeTotal =
		actual.duplicates.patient_email.length +
		actual.duplicates.patient_phone.length +
		actual.duplicates.contact_email.length;
	const expectedDupeTotal =
		expected.duplicates.patient_email.length +
		expected.duplicates.patient_phone.length +
		expected.duplicates.contact_email.length;
	rows.push({
		check: 'duplicates.groups',
		expected: expectedDupeTotal,
		actual: dupeTotal,
		ok: dupeTotal === expectedDupeTotal
	});

	return rows;
}

/**
 * @param {{
 *   tenantId: string,
 *   sourceLabel: string,
 *   expected: ReturnType<typeof expectedFromMapped>,
 *   actual: Awaited<ReturnType<typeof actualFromTenant>>,
 *   diffs: ReturnType<typeof buildDiffs>
 * }} report
 */
function printReport(report) {
	console.log('=== ETL verify ===');
	console.log(
		JSON.stringify(
			{
				tenant_id: report.tenantId,
				source: report.sourceLabel,
				expected: report.expected,
				actual: {
					counts: report.actual.counts,
					money: report.actual.money,
					duplicates: report.actual.duplicates
				}
			},
			null,
			2
		)
	);

	console.log('\n=== Diff table ===');
	console.log('| check | expected | actual | ok |');
	console.log('| --- | ---: | ---: | --- |');
	for (const row of report.diffs) {
		console.log(
			`| ${row.check} | ${JSON.stringify(row.expected)} | ${JSON.stringify(row.actual)} | ${row.ok ? '✓' : '✗'} |`
		);
	}

	console.log('\n=== Sample transactions (actual) ===');
	console.log(JSON.stringify(report.actual.sample_transactions, null, 2));
	console.log('\n=== Sample transactions (expected, up to 5) ===');
	console.log(JSON.stringify(report.expected.sample_transactions, null, 2));
}

/**
 * Programmatic verify (tests + CLI).
 * @param {{
 *   sql: import('postgres').Sql,
 *   tenantId: string,
 *   source: import('./etl.js') extends never ? never : any,
 *   sourceLabel: string
 * }} opts
 */
async function verifyEtl(opts) {
	const mapped = attachContactLegacy(mapFixture(opts.source, opts.tenantId), opts.source);
	const expected = expectedFromMapped(mapped);
	const actual = await actualFromTenant(opts.sql, opts.tenantId);
	const diffs = buildDiffs({ expected, actual });
	const failed = diffs.filter((d) => !d.ok);
	return { expected, actual, diffs, failed, mapped };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		printHelp();
		process.exit(0);
	}
	if (!args.tenantId) {
		console.error('--tenant-id is required');
		process.exit(1);
	}

	const databaseUrl = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error('Missing DATABASE_URL_APP or DATABASE_URL');
		process.exit(1);
	}

	/** @type {any} */
	let source;
	let sourceLabel;
	if (process.env.TRACKER_DATABASE_URL && args.trackerTenantId) {
		source = await loadFromTracker(process.env.TRACKER_DATABASE_URL, args.trackerTenantId);
		sourceLabel = `tracker:${args.trackerTenantId}`;
	} else {
		const fixturePath = args.fixture ?? DEFAULT_FIXTURE;
		source = loadFixtureFile(fixturePath);
		sourceLabel = fixturePath;
	}

	const sql = postgres(databaseUrl, { max: 3 });
	try {
		const [tenant] = await sql`select id from tenants where id = ${args.tenantId} limit 1`;
		if (!tenant) {
			console.error(`Tenant not found: ${args.tenantId}`);
			process.exit(1);
		}

		const result = await verifyEtl({
			sql,
			tenantId: args.tenantId,
			source,
			sourceLabel
		});

		printReport({
			tenantId: args.tenantId,
			sourceLabel,
			expected: result.expected,
			actual: result.actual,
			diffs: result.diffs
		});

		if (result.failed.length > 0) {
			console.error(`\nVERIFY FAILED: ${result.failed.length} check(s) out of tolerance.`);
			process.exit(1);
		}

		console.log('\nVERIFY OK: zero out-of-tolerance diffs.');
	} finally {
		await sql.end({ timeout: 5 });
	}
}

module.exports = {
	verifyEtl,
	expectedFromMapped,
	buildDiffs,
	parseArgs,
	toMinor
};

if (require.main === module) {
	main().catch((err) => {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	});
}
