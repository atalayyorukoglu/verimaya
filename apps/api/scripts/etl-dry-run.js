#!/usr/bin/env node
/**
 * Fixrav Tracker → Verimaya ETL dry-run (Faz 8 stub).
 *
 * Maps fixture (or --fixture path) Tracker-shaped rows to Verimaya create shapes.
 * Does NOT write to the database unless --apply is passed (apply is a no-op stub).
 *
 * Usage:
 *   pnpm --filter @verimaya/api etl:dry-run
 *   pnpm --filter @verimaya/api etl:dry-run -- --fixture ./fixtures/etl-sample.json
 *   pnpm --filter @verimaya/api etl:dry-run -- --apply
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_FIXTURE = path.join(__dirname, '..', 'fixtures', 'etl-sample.json');
const TARGET_TENANT_PLACEHOLDER = '<target-tenant-id>';

/** @typedef {{ id: number, type: string, name: string, phone: string | null, email: string | null, notes: string | null, is_internal?: boolean }} TrackerContact */
/** @typedef {{ id: number, full_name: string, phone: string | null, email: string | null, status: string, source: string | null, notes: string | null, contact_id: number | null }} TrackerCase */
/** @typedef {{ id: number, case_id: number, title: string | null, type: string | null, status: string, starts_at: string, ends_at: string | null, clinic_name: string | null, hotel_name: string | null, transfer_note: string | null, notes: string | null }} TrackerAppointment */
/** @typedef {{ id: number, case_id: number | null, kind: string, title: string, subtitle: string | null, category: string | null, occurred_on: string, status: string, invoice_status?: string, payment_method: string | null, amount_major: number, currency: string, paid_amount_major: number | null, contact_id: number | null, description: string | null }} TrackerTransaction */
/** @typedef {{ id: number, case_id: number, appointment_id: number | null, filename: string, mime_type: string, size_bytes: number, drive_url?: string }} TrackerFile */

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
	/** @type {{ fixture: string, apply: boolean, help: boolean }} */
	const out = { fixture: DEFAULT_FIXTURE, apply: false, help: false };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--') continue;
		if (arg === '--apply') out.apply = true;
		else if (arg === '--help' || arg === '-h') out.help = true;
		else if (arg === '--fixture') {
			const next = argv[++i];
			if (!next) throw new Error('--fixture requires a path');
			out.fixture = path.resolve(next);
		} else if (arg.startsWith('--fixture=')) {
			out.fixture = path.resolve(arg.slice('--fixture='.length));
		}
	}
	return out;
}

/**
 * Tracker major-unit amounts → Verimaya minor-unit integers.
 * @param {number} major
 */
function toMinor(major) {
	return Math.round(Number(major) * 100);
}

/**
 * Deterministic placeholder UUID from legacy int id (for dry-run maps only).
 * @param {string} kind
 * @param {number} legacyId
 */
function mapId(kind, legacyId) {
	const hex = Buffer.from(`${kind}:${legacyId}`).toString('hex').padEnd(32, '0').slice(0, 32);
	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		`4${hex.slice(13, 16)}`,
		`a${hex.slice(17, 20)}`,
		hex.slice(20, 32)
	].join('-');
}

/**
 * @param {{ contacts?: TrackerContact[], cases?: TrackerCase[], appointments?: TrackerAppointment[], transactions?: TrackerTransaction[], files?: TrackerFile[] }} fixture
 */
function mapFixture(fixture) {
	/** @type {Map<number, string>} */
	const contactIdMap = new Map();
	/** @type {Map<number, string>} */
	const patientIdMap = new Map();
	/** @type {Map<number, string>} */
	const appointmentIdMap = new Map();

	const contacts = (fixture.contacts ?? []).map((c) => {
		const id = mapId('contact', c.id);
		contactIdMap.set(c.id, id);
		return {
			legacy_id: c.id,
			external: { provider: 'legacy_tracker', external_id: String(c.id) },
			verimaya: {
				id,
				tenant_id: TARGET_TENANT_PLACEHOLDER,
				contact_type_name: c.type,
				display_name: c.name,
				phone: c.phone,
				email: c.email,
				notes: c.notes,
				is_internal: Boolean(c.is_internal)
			}
		};
	});

	const patients = (fixture.cases ?? []).map((c) => {
		const id = mapId('patient', c.id);
		patientIdMap.set(c.id, id);
		return {
			legacy_id: c.id,
			external: { provider: 'legacy_tracker', external_id: String(c.id) },
			verimaya: {
				id,
				tenant_id: TARGET_TENANT_PLACEHOLDER,
				full_name: c.full_name,
				phone: c.phone,
				email: c.email,
				status: c.status,
				source: c.source,
				notes: c.notes,
				contact_id:
					c.contact_id != null ? (contactIdMap.get(c.contact_id) ?? null) : null,
				assigned_user_id: null
			}
		};
	});

	const appointments = (fixture.appointments ?? []).map((a) => {
		const id = mapId('appointment', a.id);
		appointmentIdMap.set(a.id, id);
		const patientId = patientIdMap.get(a.case_id);
		if (!patientId) {
			throw new Error(`Appointment ${a.id} references missing case_id ${a.case_id}`);
		}
		const patient = patients.find((p) => p.legacy_id === a.case_id);
		return {
			legacy_id: a.id,
			external: { provider: 'legacy_tracker', external_id: String(a.id) },
			verimaya: {
				id,
				tenant_id: TARGET_TENANT_PLACEHOLDER,
				patient_id: patientId,
				patient_display_name: patient?.verimaya.full_name ?? 'Unknown',
				title: a.title,
				appointment_type: a.type,
				status: a.status,
				starts_at: a.starts_at,
				ends_at: a.ends_at,
				clinic_name: a.clinic_name,
				hotel_name: a.hotel_name,
				transfer_note: a.transfer_note,
				clinic_contact_id: null,
				hotel_contact_id: null,
				transfer_contact_id: null,
				notes: a.notes
			}
		};
	});

	const transactions = (fixture.transactions ?? []).map((t) => {
		const id = mapId('transaction', t.id);
		const amount = toMinor(t.amount_major);
		const paid =
			t.paid_amount_major == null ? null : toMinor(t.paid_amount_major);
		const patientId =
			t.case_id != null ? (patientIdMap.get(t.case_id) ?? null) : null;
		const patient = patients.find((p) => p.legacy_id === t.case_id);
		return {
			legacy_id: t.id,
			external: { provider: 'legacy_tracker', external_id: String(t.id) },
			verimaya: {
				id,
				tenant_id: TARGET_TENANT_PLACEHOLDER,
				kind: t.kind,
				title: t.title,
				subtitle: t.subtitle,
				category: t.category,
				occurred_on: t.occurred_on,
				status: t.status,
				invoice_status: t.invoice_status ?? 'none',
				payment_method: t.payment_method,
				amount,
				paid_amount: paid,
				currency: t.currency,
				amount_base: null,
				base_currency: null,
				fx_rate: null,
				fx_dated: null,
				patient_id: patientId,
				patient_display_name: patient?.verimaya.full_name ?? null,
				contact_id:
					t.contact_id != null ? (contactIdMap.get(t.contact_id) ?? null) : null,
				contact_label: null,
				description: t.description
			}
		};
	});

	const files = (fixture.files ?? []).map((f) => {
		const id = mapId('file', f.id);
		const patientId = patientIdMap.get(f.case_id);
		if (!patientId) {
			throw new Error(`File ${f.id} references missing case_id ${f.case_id}`);
		}
		return {
			legacy_id: f.id,
			external: { provider: 'legacy_tracker', external_id: String(f.id) },
			note: 'Blob/Drive not migrated; metadata only (storage_key deferred)',
			verimaya: {
				id,
				tenant_id: TARGET_TENANT_PLACEHOLDER,
				patient_id: patientId,
				appointment_id:
					f.appointment_id != null
						? (appointmentIdMap.get(f.appointment_id) ?? null)
						: null,
				filename: f.filename,
				mime_type: f.mime_type,
				size_bytes: f.size_bytes,
				storage_key: 'local://pending'
			}
		};
	});

	return { contacts, patients, appointments, transactions, files };
}

function printHelp() {
	console.log(`Usage: pnpm --filter @verimaya/api etl:dry-run [-- --fixture <path>] [--apply]

Maps Tracker-shaped JSON to Verimaya domain shapes. Default fixture:
  ${DEFAULT_FIXTURE}

Options:
  --fixture <path>  Input JSON (default: fixtures/etl-sample.json)
  --apply           Reserved; currently refused (DB write not implemented)
  --help            Show this help
`);
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		printHelp();
		process.exit(0);
	}

	if (!fs.existsSync(args.fixture)) {
		console.error(`Fixture not found: ${args.fixture}`);
		process.exit(1);
	}

	const fixture = JSON.parse(fs.readFileSync(args.fixture, 'utf8'));
	const mapped = mapFixture(fixture);

	const summary = {
		mode: args.apply ? 'apply' : 'dry-run',
		fixture: args.fixture,
		source: fixture.source ?? null,
		counts: {
			contacts: mapped.contacts.length,
			patients: mapped.patients.length,
			appointments: mapped.appointments.length,
			transactions: mapped.transactions.length,
			files: mapped.files.length
		},
		money_note: 'amount_major → minor units (*100)',
		id_note: 'legacy int ids → deterministic placeholder UUIDs (dry-run only)',
		tenant_id: TARGET_TENANT_PLACEHOLDER
	};

	console.log('=== ETL dry-run summary ===');
	console.log(JSON.stringify(summary, null, 2));
	console.log('\n=== Mapped sample (first of each) ===');
	console.log(
		JSON.stringify(
			{
				contact: mapped.contacts[0] ?? null,
				patient: mapped.patients[0] ?? null,
				appointment: mapped.appointments[0] ?? null,
				transaction: mapped.transactions[0] ?? null,
				file: mapped.files[0] ?? null
			},
			null,
			2
		)
	);

	if (args.apply) {
		console.error(
			'\n--apply refused: DB write path not implemented yet (see apps/api/scripts/etl-stub.md).'
		);
		process.exit(2);
	}

	console.log('\nDry-run OK (no database writes).');
}

try {
	main();
} catch (err) {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
}
