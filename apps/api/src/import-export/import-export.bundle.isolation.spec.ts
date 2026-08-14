import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
	APPOINTMENT_IMPORT_HEADERS,
	CASE_IMPORT_HEADERS,
	IMPORT_EXTERNAL_SOURCE,
	IMPORT_MAX_ROWS,
	IMPORT_MAX_UPLOAD_BYTES,
	TRANSACTION_IMPORT_HEADERS
} from '@verimaya/shared';
import { CryptoService } from '../common/crypto.service';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';
import { createHeaderSheet, workbookToBuffer } from './excel';
import { ImportExportService } from './import-export.service';

process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

function buildBundleXlsx(sheets: {
	cases?: Array<Record<string, string | number>>;
	appointments?: Array<Record<string, string | number>>;
	transactions?: Array<Record<string, string | number>>;
}): Promise<Buffer> {
	const wb = new ExcelJS.Workbook();
	if (sheets.cases) {
		const ws = createHeaderSheet(wb, 'Cases', CASE_IMPORT_HEADERS);
		for (const row of sheets.cases) ws.addRow(CASE_IMPORT_HEADERS.map((h) => row[h] ?? ''));
	}
	if (sheets.appointments) {
		const ws = createHeaderSheet(wb, 'Appointments', APPOINTMENT_IMPORT_HEADERS);
		for (const row of sheets.appointments) {
			ws.addRow(APPOINTMENT_IMPORT_HEADERS.map((h) => row[h] ?? ''));
		}
	}
	if (sheets.transactions) {
		const ws = createHeaderSheet(wb, 'Transactions', TRANSACTION_IMPORT_HEADERS);
		for (const row of sheets.transactions) {
			ws.addRow(TRANSACTION_IMPORT_HEADERS.map((h) => row[h] ?? ''));
		}
	}
	return workbookToBuffer(wb);
}

describe('import-export bundle (G-09)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let service: ImportExportService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`ieb-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`ieb-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`ieb-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`ieb-b-${tenantB.slice(0, 8)}`})
		`;

		for (const tenantId of [tenantA, tenantB]) {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
				await tx`
					insert into contact_types (tenant_id, name, sort_order)
					values (${tenantId}, 'Hasta', 0), (${tenantId}, 'Personel', 4)
					on conflict (tenant_id, name) do update set name = excluded.name
				`;
			});
		}

		const dbService = { client: db, sql } as unknown as DbService;
		service = new ImportExportService(new TenantContextService(dbService), new CryptoService());
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	async function seedSecretCaseA(): Promise<string> {
		const { sql } = getDb(databaseUrl);
		const [row] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [type] = await tx`
				select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1
			`;
			return tx`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name, first_name, display_name, email
				) values (
					${tenantA}, ${type!.id}, 'Hasta', 'SecretCase', 'SecretCase', 'secret-case-a@example.com'
				)
				returning id
			`;
		});
		return row!.id as string;
	}

	it('export never includes Tenant B data for Tenant A', async () => {
		await seedSecretCaseA();

		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [type] = await tx`
				select id from contact_types where tenant_id = ${tenantB} and name = 'Hasta' limit 1
			`;
			const [caseRow] = await tx`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name, first_name, display_name, email
				) values (
					${tenantB}, ${type!.id}, 'Hasta', 'TenantBOnlyCase', 'TenantBOnlyCase', 'b-only-case@example.com'
				)
				returning id
			`;
			await tx`
				insert into appointments (tenant_id, contact_id, contact_display_name, starts_at, notes)
				values (${tenantB}, ${caseRow!.id}, 'TenantBOnlyCase', now(), 'tenant-b-appt-secret')
			`;
			await tx`
				insert into transactions (tenant_id, kind, occurred_on, status, amount, description)
				values (${tenantB}, 'income', current_date, 'paid', 12345, 'tenant-b-tx-secret')
			`;
		});

		const file = await service.bundleExport(tenantA);
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(file.buffer);
		const texts: string[] = [];
		for (const ws of wb.worksheets) {
			ws.eachRow((row) => {
				row.eachCell((cell) => {
					if (cell.value != null) texts.push(String(cell.value));
				});
			});
		}
		expect(texts.some((t) => t.includes('TenantBOnlyCase'))).toBe(false);
		expect(texts.some((t) => t.includes('tenant-b-appt-secret'))).toBe(false);
		expect(texts.some((t) => t.includes('tenant-b-tx-secret'))).toBe(false);
	});

	it('dry-run + commit creates case + appointment + transaction; second commit does not duplicate', async () => {
		const buf = await buildBundleXlsx({
			cases: [
				{
					external_id: 'bundle-case-1',
					first_name: 'Bundle',
					last_name: 'Case',
					email: 'bundle-case-1@example.com'
				}
			],
			appointments: [
				{
					external_id: 'bundle-appt-1',
					contact_external_id: 'bundle-case-1',
					title: 'Consult',
					status: 'scheduled',
					starts_at: '2026-09-01T10:00:00Z'
				}
			],
			transactions: [
				{
					external_id: 'bundle-tx-1',
					kind: 'income',
					occurred_on: '2026-09-01',
					status: 'paid',
					amount: 150000,
					currency: 'TRY',
					case_contact_external_id: 'bundle-case-1'
				}
			]
		});

		const dry = await service.bundleDryRun(tenantA, buf);
		expect(dry.summary.error).toBe(0);
		expect(dry.summary.create).toBe(3);
		expect(dry.plan_token).toBeTruthy();
		expect(dry.sheets.cases?.create).toBe(1);
		expect(dry.sheets.appointments?.create).toBe(1);
		expect(dry.sheets.transactions?.create).toBe(1);

		const first = await service.bundleCommit(tenantA, dry.plan_token!, {
			actorId: null,
			actorDisplayName: 'Bundle Importer A'
		});
		expect(first.cases.created).toBe(1);
		expect(first.appointments.created).toBe(1);
		expect(first.transactions.created).toBe(1);

		const dry2 = await service.bundleDryRun(tenantA, buf);
		expect(dry2.summary.error).toBe(0);
		expect(dry2.summary.create).toBe(0);
		expect(dry2.summary.update).toBe(3);
		const second = await service.bundleCommit(tenantA, dry2.plan_token!, {
			actorId: null,
			actorDisplayName: 'Bundle Importer A'
		});
		expect(second.cases.created).toBe(0);
		expect(second.appointments.created).toBe(0);
		expect(second.transactions.created).toBe(0);

		const { sql } = getDb(databaseUrl);
		const caseRows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select count(*)::int as n from contacts
				where tenant_id = ${tenantA} and email = 'bundle-case-1@example.com' and deleted_at is null
			`;
		});
		expect(caseRows[0]?.n).toBe(1);

		const apptRows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select count(*)::int as n from appointments
				where tenant_id = ${tenantA} and title = 'Consult' and deleted_at is null
			`;
		});
		expect(apptRows[0]?.n).toBe(1);

		const txRows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select amount, amount_base, currency from transactions
				where tenant_id = ${tenantA} and amount = 150000 and deleted_at is null
			`;
		});
		expect(txRows.length).toBe(1);
		expect(txRows[0]?.amount_base).toBe(150000);

		const logs = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select entity_label from audit_logs
				where tenant_id = ${tenantA} and entity_label like 'xlsx_import:bundle:%'
			`;
		});
		expect(logs.length).toBeGreaterThanOrEqual(1);
	});

	it('Tenant B cannot use Tenant A bundle plan_token', async () => {
		const buf = await buildBundleXlsx({
			cases: [{ external_id: 'cross-case', first_name: 'Cross', email: 'cross-bundle@example.com' }]
		});
		const dry = await service.bundleDryRun(tenantA, buf);
		expect(dry.plan_token).toBeTruthy();

		await expect(
			service.bundleCommit(tenantB, dry.plan_token!, {
				actorId: null,
				actorDisplayName: 'Attacker'
			})
		).rejects.toMatchObject({
			response: { error: { code: 'invalid_plan_token' } }
		});
	});

	it('export sanitizes formula-like fields', async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [type] = await tx`
				select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1
			`;
			await tx`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name, first_name, display_name, notes
				) values (
					${tenantA}, ${type!.id}, 'Hasta', 'FormulaCase', 'FormulaCase', ${'=HYPERLINK("http://evil")'}
				)
			`;
		});
		const file = await service.bundleExport(tenantA);
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(file.buffer);
		const ws = wb.getWorksheet('Cases')!;
		let found = false;
		ws.eachRow((row) => {
			row.eachCell((cell) => {
				if (String(cell.value) === '\'=HYPERLINK("http://evil")') found = true;
			});
		});
		expect(found).toBe(true);
	});

	it('rejects oversized upload, too many rows per sheet, and corrupt files', async () => {
		await expect(
			service.bundleDryRun(tenantA, Buffer.alloc(IMPORT_MAX_UPLOAD_BYTES + 1))
		).rejects.toMatchObject({
			response: { error: { code: 'file_too_large' } }
		});

		const many = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => ({
			external_id: `bundle-many-${i}`,
			first_name: `N${i}`
		}));
		const buf = await buildBundleXlsx({ cases: many });
		await expect(service.bundleDryRun(tenantA, buf)).rejects.toMatchObject({
			response: { error: { code: 'too_many_rows' } }
		});

		await expect(service.bundleDryRun(tenantA, Buffer.from('not-xlsx'))).rejects.toMatchObject({
			response: { error: { code: 'invalid_workbook' } }
		});
	});

	it('commit rolls back the whole bundle when a tampered row fails mid-batch (partial failure)', async () => {
		const buf = await buildBundleXlsx({
			cases: [
				{
					external_id: `rollback-case-${randomUUID().slice(0, 8)}`,
					first_name: 'ShouldRollback',
					email: `rollback-bundle-${randomUUID().slice(0, 8)}@example.com`
				}
			]
		});
		const dry = await service.bundleDryRun(tenantA, buf);
		expect(dry.plan_token).toBeTruthy();

		const crypto = new CryptoService();
		const json = crypto.decrypt(Buffer.from(dry.plan_token!, 'base64url'));
		const plan = JSON.parse(json) as {
			cases: Array<{ fields: { contact_type_id: string }; action: string }>;
		};
		plan.cases[0]!.fields.contact_type_id = randomUUID(); // FK will fail on insert
		const evilToken = crypto.encrypt(JSON.stringify(plan)).toString('base64url');

		await expect(
			service.bundleCommit(tenantA, evilToken, {
				actorId: null,
				actorDisplayName: 'Rollback'
			})
		).rejects.toBeTruthy();

		const { sql } = getDb(databaseUrl);
		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select id from contacts
				where tenant_id = ${tenantA} and first_name = 'ShouldRollback' and deleted_at is null
			`;
		});
		expect(rows.length).toBe(0);
	});

	it('rejects non-integer (major-unit) transaction amounts, e.g. "12.50"', async () => {
		const buf = await buildBundleXlsx({
			transactions: [
				{
					external_id: `bad-amount-${randomUUID().slice(0, 8)}`,
					kind: 'expense',
					occurred_on: '2026-09-02',
					status: 'paid',
					amount: '12.50'
				}
			]
		});
		const dry = await service.bundleDryRun(tenantA, buf);
		expect(dry.summary.error).toBe(1);
		expect(dry.plan_token).toBeNull();
		expect(dry.rows[0]?.errors.some((e) => e.includes('amount must be an integer'))).toBe(true);
	});
});
