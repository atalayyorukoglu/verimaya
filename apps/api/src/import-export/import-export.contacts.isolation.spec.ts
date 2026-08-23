import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
	CONTACT_IMPORT_HEADERS,
	IMPORT_EXTERNAL_SOURCE,
	IMPORT_MAX_ROWS,
	IMPORT_MAX_UPLOAD_BYTES
} from '@verimaya/shared';
import { CryptoService } from '../common/crypto.service';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';
import { createHeaderSheet, sanitizeCell, workbookToBuffer } from './excel';
import { ImportExportService } from './import-export.service';

process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function buildContactsXlsx(
	rows: Array<Record<string, string | number | boolean>>
): Promise<Buffer> {
	const wb = new ExcelJS.Workbook();
	const ws = createHeaderSheet(wb, 'Contacts', CONTACT_IMPORT_HEADERS);
	for (const row of rows) {
		ws.addRow(CONTACT_IMPORT_HEADERS.map((h) => row[h] ?? ''));
	}
	return workbookToBuffer(wb);
}

describe('import-export contacts (G-10)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let service: ImportExportService;
	let typeHastaA: string;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`ie-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`ie-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`ie-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`ie-b-${tenantB.slice(0, 8)}`})
		`;

		typeHastaA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantA}, 'Hasta', 0)
				on conflict (tenant_id, name) do update set name = excluded.name
				returning id
			`;
			await tx`
				insert into contact_titles (tenant_id, name, sort_order)
				values (${tenantA}, 'Hekim', 0)
				on conflict (tenant_id, name) do update set name = excluded.name
			`;
			await tx`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name, first_name, display_name, email
				) values (
					${tenantA},
					${row!.id},
					'Hasta',
					'Secret',
					'Secret',
					'secret-a@example.com'
				)
			`;
			return row!.id as string;
		});

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantB}, 'Hasta', 0)
				on conflict (tenant_id, name) do update set name = excluded.name
			`;
		});

		const dbService = { client: db, sql } as unknown as DbService;
		service = new ImportExportService(new TenantContextService(dbService), new CryptoService());
		void typeHastaA;
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('sanitizeCell prefixes formula injection characters', () => {
		expect(sanitizeCell('=cmd')).toBe("'=cmd");
		expect(sanitizeCell('+1+1')).toBe("'+1+1");
		expect(sanitizeCell('-1')).toBe("'-1");
		expect(sanitizeCell('@sum')).toBe("'@sum");
		expect(sanitizeCell('normal')).toBe('normal');
	});

	it('export never includes Tenant B contacts for Tenant A', async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [type] = await tx`
				select id from contact_types where tenant_id = ${tenantB} and name = 'Hasta' limit 1
			`;
			await tx`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name, first_name, display_name, email
				) values (
					${tenantB}, ${type!.id}, 'Hasta', 'TenantBOnly', 'TenantBOnly', 'b-only@example.com'
				)
			`;
		});

		const file = await service.contactsExport(tenantA);
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(file.buffer);
		const ws = wb.getWorksheet('Contacts')!;
		const texts: string[] = [];
		ws.eachRow((row) => {
			row.eachCell((cell) => {
				if (cell.value != null) texts.push(String(cell.value));
			});
		});
		expect(texts.some((t) => t.includes('TenantBOnly'))).toBe(false);
		expect(texts.some((t) => t.includes('b-only@example.com'))).toBe(false);
		expect(texts.some((t) => t.includes('Secret'))).toBe(true);
	});

	it('dry-run + commit creates contacts; second commit does not duplicate', async () => {
		const buf = await buildContactsXlsx([
			{
				external_id: 'ext-ali-1',
				contact_type: 'Hasta',
				first_name: 'Ali',
				last_name: 'Yılmaz',
				email: 'ali@example.com',
				phone: '+905551111111',
				source: 'Referans',
				is_internal: 'false'
			}
		]);

		const dry = await service.contactsDryRun(tenantA, buf);
		expect(dry.summary.error).toBe(0);
		expect(dry.summary.create).toBe(1);
		expect(dry.plan_token).toBeTruthy();

		const first = await service.contactsCommit(tenantA, dry.plan_token!, {
			actorId: null,
			actorDisplayName: 'Importer A'
		});
		expect(first.created).toBe(1);

		const dry2 = await service.contactsDryRun(tenantA, buf);
		expect(dry2.summary.create).toBe(0);
		expect(dry2.summary.update + dry2.summary.unchanged).toBe(1);
		const second = await service.contactsCommit(tenantA, dry2.plan_token!, {
			actorId: null,
			actorDisplayName: 'Importer A'
		});
		expect(second.created).toBe(0);

		const { sql } = getDb(databaseUrl);
		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select count(*)::int as n from contacts
				where tenant_id = ${tenantA} and email = 'ali@example.com' and deleted_at is null
			`;
		});
		expect(rows[0]?.n).toBe(1);

		const ext = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select external_id from external_ids
				where tenant_id = ${tenantA}
					and source = ${IMPORT_EXTERNAL_SOURCE}
					and entity_type = 'contact'
					and external_id = 'ext-ali-1'
			`;
		});
		expect(ext.length).toBe(1);

		const logs = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select entity_label from audit_logs
				where tenant_id = ${tenantA}
					and entity_label like 'xlsx_import:contacts:%'
			`;
		});
		expect(logs.length).toBeGreaterThanOrEqual(1);
	});

	it('Tenant B cannot commit Tenant A plan_token', async () => {
		const buf = await buildContactsXlsx([
			{
				external_id: 'ext-cross',
				contact_type: 'Hasta',
				first_name: 'Cross',
				email: 'cross@example.com'
			}
		]);
		const dry = await service.contactsDryRun(tenantA, buf);
		await expect(
			service.contactsCommit(tenantB, dry.plan_token!, {
				actorId: null,
				actorDisplayName: 'Attacker'
			})
		).rejects.toMatchObject({
			response: { error: { code: 'invalid_plan_token' } }
		});
	});

	it('Tenant B import cannot overwrite Tenant A contact by id', async () => {
		const { sql } = getDb(databaseUrl);
		const [aContact] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select id from contacts
				where tenant_id = ${tenantA} and email = 'secret-a@example.com' limit 1
			`;
		});

		const buf = await buildContactsXlsx([
			{
				id: aContact!.id as string,
				external_id: 'steal-attempt',
				contact_type: 'Hasta',
				first_name: 'Hijacked',
				email: 'hijacked@example.com'
			}
		]);
		const dry = await service.contactsDryRun(tenantB, buf);
		// id belongs to another tenant — treated as create (id not found in B)
		expect(dry.summary.error).toBe(0);
		expect(dry.summary.create).toBe(1);
		await service.contactsCommit(tenantB, dry.plan_token!, {
			actorId: null,
			actorDisplayName: 'B'
		});

		const still = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select first_name, email from contacts where id = ${aContact!.id as string}
			`;
		});
		expect(still[0]?.first_name).toBe('Secret');
		expect(still[0]?.email).toBe('secret-a@example.com');
	});

	it('rejects oversized upload and too many rows', async () => {
		await expect(
			service.contactsDryRun(tenantA, Buffer.alloc(IMPORT_MAX_UPLOAD_BYTES + 1))
		).rejects.toMatchObject({
			response: { error: { code: 'file_too_large' } }
		});

		const many = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => ({
			external_id: `r-${i}`,
			contact_type: 'Hasta',
			first_name: `N${i}`
		}));
		const buf = await buildContactsXlsx(many);
		await expect(service.contactsDryRun(tenantA, buf)).rejects.toMatchObject({
			response: { error: { code: 'too_many_rows' } }
		});
	});

	it('rejects corrupt workbook', async () => {
		await expect(service.contactsDryRun(tenantA, Buffer.from('not-xlsx'))).rejects.toMatchObject({
			response: { error: { code: 'invalid_workbook' } }
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
					${tenantA}, ${type!.id}, 'Hasta', 'Formula', 'Formula', ${'=HYPERLINK("http://evil")'}
				)
			`;
		});
		const file = await service.contactsExport(tenantA);
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(file.buffer);
		const ws = wb.getWorksheet('Contacts')!;
		let found = false;
		ws.eachRow((row) => {
			row.eachCell((cell) => {
				if (String(cell.value) === '\'=HYPERLINK("http://evil")') found = true;
			});
		});
		expect(found).toBe(true);
	});

	it('commit rolls back when a mid-batch row fails (partial failure)', async () => {
		const buf = await buildContactsXlsx([
			{
				external_id: 'ok-1',
				contact_type: 'Hasta',
				first_name: 'OkOne',
				email: 'okone@example.com'
			},
			{
				external_id: 'bad-1',
				contact_type: 'Hasta',
				first_name: 'Bad',
				email: 'not-an-email'
			}
		]);
		const dry = await service.contactsDryRun(tenantA, buf);
		expect(dry.summary.error).toBe(1);
		expect(dry.plan_token).toBeNull();

		// Force a plan with a doomed contact_type_id to prove transactional rollback
		const goodBuf = await buildContactsXlsx([
			{
				external_id: `rollback-${createHash('sha1').update(randomUUID()).digest('hex').slice(0, 8)}`,
				contact_type: 'Hasta',
				first_name: 'ShouldRollback',
				email: `rollback-${randomUUID().slice(0, 8)}@example.com`
			}
		]);
		const goodDry = await service.contactsDryRun(tenantA, goodBuf);
		expect(goodDry.plan_token).toBeTruthy();

		const crypto = new CryptoService();
		const json = crypto.decrypt(Buffer.from(goodDry.plan_token!, 'base64url'));
		const plan = JSON.parse(json) as {
			rows: Array<{ fields: { contact_type_id: string }; action: string }>;
		};
		plan.rows[0]!.fields.contact_type_id = randomUUID(); // FK will fail
		const evilToken = crypto.encrypt(JSON.stringify(plan)).toString('base64url');

		await expect(
			service.contactsCommit(tenantA, evilToken, {
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

	it('imports a title by name, denormalizes it, and round-trips it on export', async () => {
		const buf = await buildContactsXlsx([
			{
				external_id: 'ext-titled-1',
				contact_type: 'Hasta',
				title: 'Hekim',
				first_name: 'Titled',
				last_name: 'Contact',
				email: 'titled@example.com'
			}
		]);

		const dry = await service.contactsDryRun(tenantA, buf);
		expect(dry.summary.error).toBe(0);
		expect(dry.summary.create).toBe(1);

		await service.contactsCommit(tenantA, dry.plan_token!, {
			actorId: null,
			actorDisplayName: 'Importer A'
		});

		const { sql } = getDb(databaseUrl);
		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select title_name from contacts
				where tenant_id = ${tenantA} and email = 'titled@example.com'
			`;
		});
		expect(rows[0]?.title_name).toBe('Hekim');

		const file = await service.contactsExport(tenantA);
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(file.buffer);
		const ws = wb.getWorksheet('Contacts')!;
		const texts: string[] = [];
		ws.eachRow((row) => {
			row.eachCell((cell) => {
				if (cell.value != null) texts.push(String(cell.value));
			});
		});
		expect(texts.some((t) => t === 'Hekim')).toBe(true);
	});

	it('leaves title blank when omitted, and errors on an unknown title name', async () => {
		const blank = await buildContactsXlsx([
			{
				external_id: 'ext-no-title',
				contact_type: 'Hasta',
				first_name: 'NoTitle',
				email: 'no-title@example.com'
			}
		]);
		const dryBlank = await service.contactsDryRun(tenantA, blank);
		expect(dryBlank.summary.error).toBe(0);
		expect(dryBlank.summary.create).toBe(1);

		const unknown = await buildContactsXlsx([
			{
				external_id: 'ext-unknown-title',
				contact_type: 'Hasta',
				title: 'Uzaylı Ünvan',
				first_name: 'Ghost',
				email: 'ghost@example.com'
			}
		]);
		const dryUnknown = await service.contactsDryRun(tenantA, unknown);
		expect(dryUnknown.summary.error).toBe(1);
		expect(dryUnknown.rows[0]?.errors.some((e) => e.includes('unknown title'))).toBe(true);
	});
});
