import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import {
	APPOINTMENT_IMPORT_HEADERS,
	APPOINTMENT_IMPORT_HEADER_ALIASES,
	CASE_IMPORT_HEADERS,
	CASE_IMPORT_HEADER_ALIASES,
	CONTACT_IMPORT_HEADERS,
	CONTACT_IMPORT_HEADER_ALIASES,
	DEFAULT_CONTACT_TYPE_NAMES,
	IMPORT_EXTERNAL_SOURCE,
	IMPORT_MAX_ROWS,
	IMPORT_MAX_UPLOAD_BYTES,
	IMPORT_PLAN_TTL_MS,
	TRANSACTION_IMPORT_HEADERS,
	TRANSACTION_IMPORT_HEADER_ALIASES,
	appointmentStatusSchema,
	bundleImportPlanSchema,
	bundleSheetSchema,
	contactCreateSchema,
	contactImportPlanSchema,
	contactStatusSchema,
	invoiceStatusSchema,
	supportedCurrencySchema,
	transactionKindSchema,
	transactionStatusSchema,
	type AppointmentImportPlanRow,
	type AppointmentStatus,
	type BundleImportPlan,
	type BundleSheet,
	type ContactImportPlan,
	type ContactImportPlanRow,
	type ImportBundleCommitResult,
	type ImportBundleDryRunResult,
	type ImportBundleDryRunRow,
	type ImportCommitResult,
	type ImportDryRunResult,
	type ImportDryRunRow,
	type ImportDryRunSummary,
	type InvoiceStatus,
	type SupportedCurrency,
	type TransactionImportPlanRow,
	type TransactionStatus
} from '@verimaya/shared';
import ExcelJS from 'exceljs';
import { writeAuditLog, type AuditActor } from '../common/audit-helper';
import { CryptoService } from '../common/crypto.service';
import {
	appointments,
	contactTitles,
	contactTypes,
	contacts,
	externalIds,
	organizations,
	tenants,
	transactions
} from '../db/schema';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import {
	createHeaderSheet,
	loadWorkbook,
	sanitizeRow,
	sheetToObjects,
	workbookToBuffer
} from './excel';

const PREVIEW_ROW_CAP = 100;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const HASTA_TYPE = DEFAULT_CONTACT_TYPE_NAMES[0];
const PERSONEL_TYPE = DEFAULT_CONTACT_TYPE_NAMES[4];

const BUNDLE_SHEET_NAMES: Record<BundleSheet, string[]> = {
	cases: ['Cases', 'Hastalar', 'Patients'],
	appointments: ['Appointments', 'Randevular'],
	transactions: ['Transactions', 'İşlemler', 'Islemler']
};

function deriveDisplayName(firstName: string, lastName: string | null | undefined): string {
	return `${firstName}${lastName?.trim() ? ` ${lastName.trim()}` : ''}`.trim();
}

function parseBool(raw: string | undefined): boolean | undefined {
	if (raw == null || raw === '') return undefined;
	const s = raw.trim().toLowerCase();
	if (['1', 'true', 'yes', 'evet', 'y'].includes(s)) return true;
	if (['0', 'false', 'no', 'hayır', 'hayir', 'n'].includes(s)) return false;
	return undefined;
}

function contentExternalId(fields: Record<string, string>): string {
	const canonical = [
		fields.contact_type ?? '',
		fields.first_name ?? '',
		fields.last_name ?? '',
		fields.email ?? '',
		fields.phone ?? '',
		fields.organization ?? '',
		fields.status ?? '',
		fields.source ?? '',
		fields.medium ?? '',
		fields.campaign ?? '',
		fields.is_internal ?? ''
	].join('\u001f');
	return `h:${createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 32)}`;
}

function contentExternalIdForCase(fields: Record<string, string>): string {
	const canonical = [
		fields.first_name ?? '',
		fields.last_name ?? '',
		fields.email ?? '',
		fields.phone ?? '',
		fields.status ?? '',
		fields.source ?? '',
		fields.medium ?? '',
		fields.campaign ?? ''
	].join('\u001f');
	return `c:${createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 32)}`;
}

function contentExternalIdForAppointment(fields: Record<string, string>): string {
	const canonical = [
		fields.contact_id ?? '',
		fields.contact_external_id ?? '',
		fields.contact_email ?? '',
		fields.title ?? '',
		fields.starts_at ?? '',
		fields.appointment_type ?? ''
	].join('\u001f');
	return `a:${createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 32)}`;
}

function contentExternalIdForTransaction(fields: Record<string, string>): string {
	const canonical = [
		fields.kind ?? '',
		fields.occurred_on ?? '',
		fields.amount ?? '',
		fields.currency ?? '',
		fields.category ?? '',
		fields.subtitle ?? '',
		fields.case_contact_id ?? '',
		fields.case_contact_external_id ?? ''
	].join('\u001f');
	return `t:${createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 32)}`;
}

/** Parses a cell into a full ISO-8601 datetime string, or null when unparseable. */
function parseIsoDateTimeCell(raw: string): string | null {
	const d = new Date(raw);
	if (Number.isNaN(d.getTime())) return null;
	return d.toISOString();
}

/** Parses a cell into a YYYY-MM-DD calendar date string, or null when unparseable. */
function parseIsoDateCell(raw: string): string | null {
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const d = new Date(raw);
	if (Number.isNaN(d.getTime())) return null;
	return d.toISOString().slice(0, 10);
}

@Injectable()
export class ImportExportService {
	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly crypto: CryptoService
	) {}

	assertUploadSize(byteLength: number): void {
		if (byteLength > IMPORT_MAX_UPLOAD_BYTES) {
			throw new PayloadTooLargeException({
				error: {
					code: 'file_too_large',
					message: `Import file exceeds ${IMPORT_MAX_UPLOAD_BYTES} byte limit`
				}
			});
		}
	}

	async contactsTemplate(): Promise<{
		filename: string;
		mimeType: string;
		buffer: Buffer;
	}> {
		const wb = new ExcelJS.Workbook();
		createHeaderSheet(wb, 'Contacts', CONTACT_IMPORT_HEADERS);
		return {
			filename: 'contacts-template.xlsx',
			mimeType: XLSX_MIME,
			buffer: await workbookToBuffer(wb)
		};
	}

	async contactsExport(tenantId: string): Promise<{
		filename: string;
		mimeType: string;
		buffer: Buffer;
	}> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db
				.select({
					id: contacts.id,
					contactTypeName: contacts.contactTypeName,
					titleName: contacts.titleName,
					firstName: contacts.firstName,
					lastName: contacts.lastName,
					phone: contacts.phone,
					email: contacts.email,
					notes: contacts.notes,
					organizationId: contacts.organizationId,
					status: contacts.status,
					source: contacts.source,
					medium: contacts.medium,
					campaign: contacts.campaign,
					isInternal: contacts.isInternal
				})
				.from(contacts)
				.where(and(eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)))
				.orderBy(contacts.createdAt);

			const orgs = await db
				.select({ id: organizations.id, name: organizations.name })
				.from(organizations)
				.where(eq(organizations.tenantId, tenantId));
			const orgName = new Map(orgs.map((o) => [o.id, o.name]));

			const extRows = await db
				.select({
					internalId: externalIds.internalId,
					externalId: externalIds.externalId
				})
				.from(externalIds)
				.where(
					and(
						eq(externalIds.tenantId, tenantId),
						eq(externalIds.source, IMPORT_EXTERNAL_SOURCE),
						eq(externalIds.entityType, 'contact')
					)
				);
			const extByInternal = new Map(extRows.map((e) => [e.internalId, e.externalId]));

			const wb = new ExcelJS.Workbook();
			const ws = createHeaderSheet(wb, 'Contacts', CONTACT_IMPORT_HEADERS);
			for (const r of rows) {
				ws.addRow(
					sanitizeRow([
						extByInternal.get(r.id) ?? '',
						r.id,
						r.contactTypeName,
						r.titleName ?? '',
						r.firstName ?? '',
						r.lastName ?? '',
						r.phone ?? '',
						r.email ?? '',
						r.notes ?? '',
						r.organizationId ? (orgName.get(r.organizationId) ?? '') : '',
						r.status ?? '',
						r.source ?? '',
						r.medium ?? '',
						r.campaign ?? '',
						r.isInternal ? 'true' : 'false'
					])
				);
			}

			return {
				filename: 'contacts-export.xlsx',
				mimeType: XLSX_MIME,
				buffer: await workbookToBuffer(wb)
			};
		});
	}

	async contactsDryRun(tenantId: string, data: Buffer): Promise<ImportDryRunResult> {
		this.assertUploadSize(data.byteLength);
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const { rawRows } = await this.parseContactWorkbook(data);
			const { preview, planRows, summary } = await this.classifyContactRows(db, tenantId, rawRows);

			if (summary.error > 0) {
				return {
					plan_token: null,
					expires_at: null,
					summary,
					rows: preview
				};
			}

			const exp = Date.now() + IMPORT_PLAN_TTL_MS;
			const plan: ContactImportPlan = {
				v: 1,
				kind: 'contacts',
				tenant_id: tenantId,
				exp,
				rows: planRows
			};
			const plan_token = this.crypto.encrypt(JSON.stringify(plan)).toString('base64url');
			return {
				plan_token,
				expires_at: new Date(exp).toISOString(),
				summary,
				rows: preview
			};
		});
	}

	async contactsCommit(
		tenantId: string,
		planToken: string,
		actor: AuditActor
	): Promise<ImportCommitResult> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) =>
			this.contactsCommitWithDb(db, tenantId, planToken, actor)
		);
	}

	async contactsCommitWithDb(
		db: TenantDb,
		tenantId: string,
		planToken: string,
		actor: AuditActor
	): Promise<ImportCommitResult> {
		const plan = this.decryptContactPlan(tenantId, planToken);
		let created = 0;
		let updated = 0;
		let unchanged = 0;

		for (const row of plan.rows) {
			if (row.action === 'unchanged') {
				unchanged += 1;
				continue;
			}

			const typeName = await this.requireContactTypeName(db, row.fields.contact_type_id);
			const titleName = await this.resolveTitleName(db, row.fields.title_id ?? null);
			const firstName = row.fields.first_name.trim();
			const lastName = row.fields.last_name?.trim() || null;
			const displayName = deriveDisplayName(firstName, lastName);
			const values = {
				contactTypeId: row.fields.contact_type_id,
				contactTypeName: typeName,
				titleId: row.fields.title_id ?? null,
				titleName,
				firstName,
				lastName,
				displayName,
				phone: row.fields.phone ?? null,
				email: row.fields.email ?? null,
				notes: row.fields.notes ?? null,
				organizationId: row.fields.organization_id ?? null,
				status: row.fields.status ?? null,
				assignedUserId: row.fields.assigned_user_id ?? null,
				source: row.fields.source ?? null,
				medium: row.fields.medium ?? null,
				campaign: row.fields.campaign ?? null,
				referredByContactId: row.fields.referred_by_contact_id ?? null,
				isInternal: row.fields.is_internal ?? false
			};

			if (row.action === 'create') {
				const [inserted] = await db
					.insert(contacts)
					.values({ tenantId, ...values })
					.returning({ id: contacts.id });
				if (!inserted) {
					throw new BadRequestException({
						error: {
							code: 'import_failed',
							message: `Insert failed at row ${row.row_number}`
						}
					});
				}
				await db.insert(externalIds).values({
					tenantId,
					source: IMPORT_EXTERNAL_SOURCE,
					entityType: 'contact',
					externalId: row.external_id,
					internalId: inserted.id
				});
				created += 1;
			} else {
				const contactId = row.contact_id;
				if (!contactId) {
					throw new BadRequestException({
						error: {
							code: 'import_failed',
							message: `Missing contact_id for update at row ${row.row_number}`
						}
					});
				}
				const [existing] = await db
					.select({ id: contacts.id })
					.from(contacts)
					.where(
						and(
							eq(contacts.id, contactId),
							eq(contacts.tenantId, tenantId),
							isNull(contacts.deletedAt)
						)
					)
					.limit(1);
				if (!existing) {
					throw new BadRequestException({
						error: {
							code: 'import_failed',
							message: `Contact disappeared before commit (row ${row.row_number})`
						}
					});
				}
				await db
					.update(contacts)
					.set({ ...values, updatedAt: new Date() })
					.where(eq(contacts.id, contactId));
				await this.ensureExternalId(db, tenantId, row.external_id, contactId);
				updated += 1;
			}
		}

		await writeAuditLog(
			db,
			tenantId,
			actor,
			'create',
			'tenant',
			`xlsx_import:contacts:created=${created},updated=${updated}`
		);

		return { created, updated, unchanged };
	}

	private decryptContactPlan(tenantId: string, planToken: string): ContactImportPlan {
		let json: string;
		try {
			json = this.crypto.decrypt(Buffer.from(planToken, 'base64url'));
		} catch {
			throw new BadRequestException({
				error: {
					code: 'invalid_plan_token',
					message: 'Import plan token is invalid'
				}
			});
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(json);
		} catch {
			throw new BadRequestException({
				error: {
					code: 'invalid_plan_token',
					message: 'Import plan token is corrupt'
				}
			});
		}
		const plan = contactImportPlanSchema.safeParse(parsed);
		if (!plan.success) {
			throw new BadRequestException({
				error: {
					code: 'invalid_plan_token',
					message: 'Import plan schema mismatch'
				}
			});
		}
		if (plan.data.tenant_id !== tenantId) {
			throw new BadRequestException({
				error: {
					code: 'invalid_plan_token',
					message: 'Import plan tenant mismatch'
				}
			});
		}
		if (plan.data.exp < Date.now()) {
			throw new BadRequestException({
				error: {
					code: 'plan_expired',
					message: 'Import plan expired — run dry-run again'
				}
			});
		}
		return plan.data;
	}

	private async parseContactWorkbook(data: Buffer): Promise<{
		rawRows: Array<{ row_number: number; cells: Record<string, string> }>;
	}> {
		let wb: ExcelJS.Workbook;
		try {
			wb = await loadWorkbook(data);
		} catch {
			throw new BadRequestException({
				error: {
					code: 'invalid_workbook',
					message: 'File is not a valid .xlsx workbook'
				}
			});
		}
		const ws =
			wb.getWorksheet('Contacts') ??
			wb.getWorksheet('Kişiler') ??
			wb.getWorksheet('Kisiler') ??
			wb.worksheets[0];
		if (!ws) {
			throw new BadRequestException({
				error: { code: 'invalid_workbook', message: 'Workbook has no sheets' }
			});
		}

		const { rows } = sheetToObjects(ws, CONTACT_IMPORT_HEADERS, CONTACT_IMPORT_HEADER_ALIASES);
		if (rows.length > IMPORT_MAX_ROWS) {
			throw new BadRequestException({
				error: {
					code: 'too_many_rows',
					message: `Import exceeds ${IMPORT_MAX_ROWS} row limit`
				}
			});
		}

		return {
			rawRows: rows.map((cells, i) => ({ row_number: i + 2, cells }))
		};
	}

	private async classifyContactRows(
		db: TenantDb,
		tenantId: string,
		rawRows: Array<{ row_number: number; cells: Record<string, string> }>
	): Promise<{
		preview: ImportDryRunRow[];
		planRows: ContactImportPlanRow[];
		summary: ImportDryRunResult['summary'];
	}> {
		const types = await db
			.select({ id: contactTypes.id, name: contactTypes.name })
			.from(contactTypes)
			.where(eq(contactTypes.tenantId, tenantId));
		const typeByName = new Map(types.map((t) => [t.name.trim().toLowerCase(), t]));

		const titles = await db
			.select({ id: contactTitles.id, name: contactTitles.name })
			.from(contactTitles)
			.where(eq(contactTitles.tenantId, tenantId));
		const titleByName = new Map(titles.map((t) => [t.name.trim().toLowerCase(), t]));

		const orgs = await db
			.select({ id: organizations.id, name: organizations.name })
			.from(organizations)
			.where(eq(organizations.tenantId, tenantId));
		const orgByName = new Map(orgs.map((o) => [o.name.trim().toLowerCase(), o]));

		const existingContacts = await db
			.select({
				id: contacts.id,
				email: contacts.email,
				phone: contacts.phone,
				firstName: contacts.firstName,
				lastName: contacts.lastName,
				contactTypeId: contacts.contactTypeId,
				titleId: contacts.titleId,
				organizationId: contacts.organizationId,
				status: contacts.status,
				source: contacts.source,
				medium: contacts.medium,
				campaign: contacts.campaign,
				isInternal: contacts.isInternal,
				notes: contacts.notes
			})
			.from(contacts)
			.where(and(eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)));
		const byId = new Map(existingContacts.map((c) => [c.id, c]));
		const byEmail = new Map(
			existingContacts
				.filter((c) => c.email)
				.map((c) => [c.email!.trim().toLowerCase(), c] as const)
		);
		const byPhone = new Map(
			existingContacts.filter((c) => c.phone).map((c) => [c.phone!.trim(), c] as const)
		);

		const extRows = await db
			.select({
				externalId: externalIds.externalId,
				internalId: externalIds.internalId
			})
			.from(externalIds)
			.where(
				and(
					eq(externalIds.tenantId, tenantId),
					eq(externalIds.source, IMPORT_EXTERNAL_SOURCE),
					eq(externalIds.entityType, 'contact')
				)
			);
		const byExternal = new Map(extRows.map((e) => [e.externalId, e.internalId]));

		const preview: ImportDryRunRow[] = [];
		const planRows: ContactImportPlanRow[] = [];
		const summary = {
			total_rows: rawRows.length,
			create: 0,
			update: 0,
			unchanged: 0,
			error: 0
		};
		const seenExternal = new Set<string>();

		for (const { row_number, cells } of rawRows) {
			const errors: string[] = [];
			const firstName = (cells.first_name ?? '').trim();
			if (!firstName) errors.push('first_name is required');

			const typeRaw = (cells.contact_type ?? '').trim();
			const type = typeRaw ? typeByName.get(typeRaw.toLowerCase()) : undefined;
			if (!typeRaw) errors.push('contact_type is required');
			else if (!type) errors.push(`unknown contact_type: ${typeRaw}`);

			/** Ünvan opsiyonel — boş bırakılabilir, verilmişse tenant sözlüğünde bulunmalı. */
			const titleRaw = (cells.title ?? '').trim();
			const title = titleRaw ? titleByName.get(titleRaw.toLowerCase()) : undefined;
			if (titleRaw && !title) errors.push(`unknown title: ${titleRaw}`);

			let organizationId: string | null = null;
			const orgRaw = (cells.organization ?? '').trim();
			if (orgRaw) {
				const org = orgByName.get(orgRaw.toLowerCase());
				if (!org) errors.push(`unknown organization: ${orgRaw}`);
				else organizationId = org.id;
			}

			let status: string | null = null;
			const statusRaw = (cells.status ?? '').trim();
			if (statusRaw) {
				const st = contactStatusSchema.safeParse(statusRaw);
				if (!st.success) errors.push(`invalid status: ${statusRaw}`);
				else status = st.data;
			}

			const isInternalParsed = parseBool(cells.is_internal);
			if (cells.is_internal && isInternalParsed === undefined) {
				errors.push(`invalid is_internal: ${cells.is_internal}`);
			}

			const emailRaw = (cells.email ?? '').trim().toLowerCase() || null;
			const phoneRaw = (cells.phone ?? '').trim() || null;
			const lastName = (cells.last_name ?? '').trim() || null;

			const externalId = (cells.external_id ?? '').trim() || contentExternalId(cells);
			if (seenExternal.has(externalId)) {
				errors.push(`duplicate external_id in file: ${externalId}`);
			}
			seenExternal.add(externalId);

			const idRaw = (cells.id ?? '').trim();
			let match = idRaw && byId.has(idRaw) ? byId.get(idRaw)! : undefined;
			if (!match && byExternal.has(externalId)) {
				const internal = byExternal.get(externalId)!;
				match = byId.get(internal);
			}
			if (!match && emailRaw && byEmail.has(emailRaw)) match = byEmail.get(emailRaw);
			if (!match && phoneRaw && byPhone.has(phoneRaw)) match = byPhone.get(phoneRaw);

			const fieldsCandidate = {
				contact_type_id: type?.id ?? '00000000-0000-0000-0000-000000000000',
				title_id: title?.id ?? null,
				first_name: firstName || 'x',
				last_name: lastName,
				phone: phoneRaw,
				email: emailRaw,
				notes: (cells.notes ?? '').trim() || null,
				organization_id: organizationId,
				status: status as never,
				source: (cells.source ?? '').trim() || null,
				medium: (cells.medium ?? '').trim() || null,
				campaign: (cells.campaign ?? '').trim() || null,
				is_internal: isInternalParsed ?? false
			};

			if (emailRaw) {
				const emailCheck = contactCreateSchema.shape.email.safeParse(emailRaw);
				if (!emailCheck.success) errors.push('invalid email');
			}

			const validated = contactCreateSchema.safeParse(fieldsCandidate);
			if (!validated.success && errors.length === 0) {
				errors.push(...validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
			}

			const label = deriveDisplayName(firstName || '?', lastName) || null;

			if (errors.length > 0) {
				summary.error += 1;
				preview.push({
					row_number,
					action: 'error',
					external_id: externalId,
					label,
					errors
				});
				continue;
			}

			const fields = validated.success
				? validated.data
				: contactCreateSchema.parse(fieldsCandidate);

			let action: 'create' | 'update' | 'unchanged' = 'create';
			let contactId: string | null = null;
			if (match) {
				contactId = match.id;
				const same =
					match.firstName === fields.first_name &&
					(match.lastName ?? null) === (fields.last_name ?? null) &&
					match.contactTypeId === fields.contact_type_id &&
					(match.titleId ?? null) === (fields.title_id ?? null) &&
					(match.phone ?? null) === (fields.phone ?? null) &&
					(match.email ?? null) === (fields.email ?? null) &&
					(match.notes ?? null) === (fields.notes ?? null) &&
					(match.organizationId ?? null) === (fields.organization_id ?? null) &&
					(match.status ?? null) === (fields.status ?? null) &&
					(match.source ?? null) === (fields.source ?? null) &&
					(match.medium ?? null) === (fields.medium ?? null) &&
					(match.campaign ?? null) === (fields.campaign ?? null) &&
					match.isInternal === (fields.is_internal ?? false);
				action = same ? 'unchanged' : 'update';
			}

			if (action === 'create') summary.create += 1;
			else if (action === 'update') summary.update += 1;
			else summary.unchanged += 1;

			planRows.push({
				row_number,
				action,
				external_id: externalId,
				contact_id: contactId,
				fields
			});
			preview.push({
				row_number,
				action,
				external_id: externalId,
				label,
				errors: []
			});
		}

		preview.sort((a, b) => {
			const rank = (x: ImportDryRunRow) =>
				x.action === 'error' ? 0 : x.action === 'create' ? 1 : x.action === 'update' ? 2 : 3;
			return rank(a) - rank(b) || a.row_number - b.row_number;
		});

		return {
			preview: preview.slice(0, PREVIEW_ROW_CAP),
			planRows,
			summary
		};
	}

	private async requireContactTypeName(db: TenantDb, contactTypeId: string): Promise<string> {
		const [row] = await db
			.select({ name: contactTypes.name })
			.from(contactTypes)
			.where(eq(contactTypes.id, contactTypeId))
			.limit(1);
		if (!row) {
			throw new BadRequestException({
				error: {
					code: 'invalid_contact_type',
					message: 'Contact type not found'
				}
			});
		}
		return row.name;
	}

	/** Ünvan opsiyonel — `null` girildiyse ünvansız kalır; girildiyse tenant sözlüğünde bulunmalı. */
	private async resolveTitleName(db: TenantDb, titleId: string | null): Promise<string | null> {
		if (!titleId) return null;
		const [row] = await db
			.select({ name: contactTitles.name })
			.from(contactTitles)
			.where(eq(contactTitles.id, titleId))
			.limit(1);
		if (!row) {
			throw new BadRequestException({
				error: {
					code: 'invalid_contact_title',
					message: 'Contact title not found'
				}
			});
		}
		return row.name;
	}

	private async ensureExternalId(
		db: TenantDb,
		tenantId: string,
		externalId: string,
		internalId: string,
		entityType: 'contact' | 'appointment' | 'transaction' = 'contact'
	): Promise<void> {
		const [existing] = await db
			.select({ id: externalIds.id })
			.from(externalIds)
			.where(
				and(
					eq(externalIds.tenantId, tenantId),
					eq(externalIds.source, IMPORT_EXTERNAL_SOURCE),
					eq(externalIds.entityType, entityType),
					eq(externalIds.externalId, externalId)
				)
			)
			.limit(1);
		if (existing) return;
		await db.insert(externalIds).values({
			tenantId,
			source: IMPORT_EXTERNAL_SOURCE,
			entityType,
			externalId,
			internalId
		});
	}

	private async assertContactType(
		db: TenantDb,
		contactId: string,
		expectedTypeName: string,
		field: string,
		rowNumber: number
	): Promise<void> {
		const [row] = await db
			.select({ contactTypeName: contacts.contactTypeName })
			.from(contacts)
			.where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
			.limit(1);
		if (!row) {
			throw new BadRequestException({
				error: {
					code: 'import_failed',
					message: `${field} not found (row ${rowNumber})`
				}
			});
		}
		if (row.contactTypeName !== expectedTypeName) {
			throw new BadRequestException({
				error: {
					code: 'invalid_contact_type',
					message: `${field} must reference a ${expectedTypeName} contact (row ${rowNumber})`
				}
			});
		}
	}

	// ---------------------------------------------------------------------
	// G-09 — Bundle (Cases / Appointments / Transactions) import/export
	// ---------------------------------------------------------------------

	async bundleTemplate(): Promise<{
		filename: string;
		mimeType: string;
		buffer: Buffer;
	}> {
		const wb = new ExcelJS.Workbook();
		createHeaderSheet(wb, 'Cases', CASE_IMPORT_HEADERS);
		createHeaderSheet(wb, 'Appointments', APPOINTMENT_IMPORT_HEADERS);
		createHeaderSheet(wb, 'Transactions', TRANSACTION_IMPORT_HEADERS);
		return {
			filename: 'bundle-template.xlsx',
			mimeType: XLSX_MIME,
			buffer: await workbookToBuffer(wb)
		};
	}

	async bundleExport(tenantId: string): Promise<{
		filename: string;
		mimeType: string;
		buffer: Buffer;
	}> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const types = await db
				.select({ id: contactTypes.id, name: contactTypes.name })
				.from(contactTypes)
				.where(eq(contactTypes.tenantId, tenantId));
			const hasta = types.find((t) => t.name.trim().toLowerCase() === HASTA_TYPE.toLowerCase());

			const extRows = await db
				.select({
					internalId: externalIds.internalId,
					externalId: externalIds.externalId,
					entityType: externalIds.entityType
				})
				.from(externalIds)
				.where(
					and(eq(externalIds.tenantId, tenantId), eq(externalIds.source, IMPORT_EXTERNAL_SOURCE))
				);
			const extByInternal = new Map(
				extRows.map((e) => [`${e.entityType}:${e.internalId}`, e.externalId])
			);
			const contactExt = (id: string | null): string =>
				id ? (extByInternal.get(`contact:${id}`) ?? '') : '';

			const wb = new ExcelJS.Workbook();

			const caseRows = hasta
				? await db
						.select({
							id: contacts.id,
							firstName: contacts.firstName,
							lastName: contacts.lastName,
							phone: contacts.phone,
							email: contacts.email,
							notes: contacts.notes,
							status: contacts.status,
							source: contacts.source,
							medium: contacts.medium,
							campaign: contacts.campaign
						})
						.from(contacts)
						.where(
							and(
								eq(contacts.tenantId, tenantId),
								eq(contacts.contactTypeId, hasta.id),
								isNull(contacts.deletedAt)
							)
						)
						.orderBy(contacts.createdAt)
				: [];
			const wsCases = createHeaderSheet(wb, 'Cases', CASE_IMPORT_HEADERS);
			for (const r of caseRows) {
				wsCases.addRow(
					sanitizeRow([
						contactExt(r.id),
						r.id,
						r.firstName ?? '',
						r.lastName ?? '',
						r.phone ?? '',
						r.email ?? '',
						r.notes ?? '',
						r.status ?? '',
						r.source ?? '',
						r.medium ?? '',
						r.campaign ?? ''
					])
				);
			}

			const apptRows = await db
				.select({
					id: appointments.id,
					contactId: appointments.contactId,
					contactEmail: contacts.email,
					title: appointments.title,
					appointmentType: appointments.appointmentType,
					status: appointments.status,
					startsAt: appointments.startsAt,
					endsAt: appointments.endsAt,
					clinicName: appointments.clinicName,
					hotelName: appointments.hotelName,
					transferNote: appointments.transferNote,
					clinicContactId: appointments.clinicContactId,
					hotelContactId: appointments.hotelContactId,
					transferContactId: appointments.transferContactId,
					notes: appointments.notes
				})
				.from(appointments)
				.leftJoin(contacts, eq(appointments.contactId, contacts.id))
				.where(and(eq(appointments.tenantId, tenantId), isNull(appointments.deletedAt)))
				.orderBy(appointments.createdAt);
			const wsAppt = createHeaderSheet(wb, 'Appointments', APPOINTMENT_IMPORT_HEADERS);
			for (const r of apptRows) {
				wsAppt.addRow(
					sanitizeRow([
						extByInternal.get(`appointment:${r.id}`) ?? '',
						r.id,
						contactExt(r.contactId),
						r.contactId,
						r.contactEmail ?? '',
						r.title ?? '',
						r.appointmentType ?? '',
						r.status,
						r.startsAt.toISOString(),
						r.endsAt ? r.endsAt.toISOString() : '',
						r.clinicName ?? '',
						r.hotelName ?? '',
						r.transferNote ?? '',
						contactExt(r.clinicContactId),
						contactExt(r.hotelContactId),
						contactExt(r.transferContactId),
						r.notes ?? ''
					])
				);
			}

			const txRows = await db
				.select({
					id: transactions.id,
					kind: transactions.kind,
					title: transactions.title,
					category: transactions.category,
					subtitle: transactions.subtitle,
					occurredOn: transactions.occurredOn,
					status: transactions.status,
					invoiceStatus: transactions.invoiceStatus,
					paymentMethod: transactions.paymentMethod,
					amount: transactions.amount,
					paidAmount: transactions.paidAmount,
					currency: transactions.currency,
					amountBase: transactions.amountBase,
					fxRate: transactions.fxRate,
					fxDated: transactions.fxDated,
					contactId: transactions.contactId,
					contactLabel: transactions.contactLabel,
					caseContactId: transactions.caseContactId,
					responsibleContactId: transactions.responsibleContactId,
					description: transactions.description
				})
				.from(transactions)
				.where(and(eq(transactions.tenantId, tenantId), isNull(transactions.deletedAt)))
				.orderBy(transactions.createdAt);
			const wsTx = createHeaderSheet(wb, 'Transactions', TRANSACTION_IMPORT_HEADERS);
			for (const r of txRows) {
				wsTx.addRow(
					sanitizeRow([
						extByInternal.get(`transaction:${r.id}`) ?? '',
						r.id,
						r.kind,
						r.title ?? '',
						r.category ?? '',
						r.subtitle ?? '',
						r.occurredOn,
						r.status,
						r.invoiceStatus,
						r.paymentMethod ?? '',
						r.amount,
						r.paidAmount ?? '',
						r.currency,
						r.amountBase ?? '',
						r.fxRate ?? '',
						r.fxDated ?? '',
						contactExt(r.contactId),
						r.contactId ?? '',
						r.contactLabel ?? '',
						contactExt(r.caseContactId),
						r.caseContactId ?? '',
						contactExt(r.responsibleContactId),
						r.responsibleContactId ?? '',
						r.description ?? ''
					])
				);
			}

			return {
				filename: 'bundle-export.xlsx',
				mimeType: XLSX_MIME,
				buffer: await workbookToBuffer(wb)
			};
		});
	}

	async bundleDryRun(
		tenantId: string,
		data: Buffer,
		scope?: BundleSheet | null
	): Promise<ImportBundleDryRunResult> {
		this.assertUploadSize(data.byteLength);
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const wb = await this.loadBundleWorkbook(data);
			const sheetsToProcess: BundleSheet[] = scope
				? [scope]
				: bundleSheetSchema.options.filter((s) => this.getBundleWorksheet(wb, s) != null);

			if (sheetsToProcess.length === 0) {
				throw new BadRequestException({
					error: {
						code: 'invalid_workbook',
						message: 'No recognized Cases/Appointments/Transactions sheet found'
					}
				});
			}

			const rawCases = sheetsToProcess.includes('cases')
				? this.readBundleSheetOrThrow(wb, 'cases', CASE_IMPORT_HEADERS, CASE_IMPORT_HEADER_ALIASES)
				: [];
			const rawAppointments = sheetsToProcess.includes('appointments')
				? this.readBundleSheetOrThrow(
						wb,
						'appointments',
						APPOINTMENT_IMPORT_HEADERS,
						APPOINTMENT_IMPORT_HEADER_ALIASES
					)
				: [];
			const rawTransactions = sheetsToProcess.includes('transactions')
				? this.readBundleSheetOrThrow(
						wb,
						'transactions',
						TRANSACTION_IMPORT_HEADERS,
						TRANSACTION_IMPORT_HEADER_ALIASES
					)
				: [];

			const casesResult = await this.classifyCaseRows(db, tenantId, rawCases);
			const apptResult = await this.classifyAppointmentRows(
				db,
				tenantId,
				rawAppointments,
				casesResult.planRows
			);
			const txResult = await this.classifyTransactionRows(
				db,
				tenantId,
				rawTransactions,
				casesResult.planRows
			);

			const summary: ImportDryRunSummary = {
				total_rows:
					casesResult.summary.total_rows +
					apptResult.summary.total_rows +
					txResult.summary.total_rows,
				create: casesResult.summary.create + apptResult.summary.create + txResult.summary.create,
				update: casesResult.summary.update + apptResult.summary.update + txResult.summary.update,
				unchanged:
					casesResult.summary.unchanged + apptResult.summary.unchanged + txResult.summary.unchanged,
				error: casesResult.summary.error + apptResult.summary.error + txResult.summary.error
			};

			const sheets: ImportBundleDryRunResult['sheets'] = {};
			if (sheetsToProcess.includes('cases')) sheets.cases = casesResult.summary;
			if (sheetsToProcess.includes('appointments')) sheets.appointments = apptResult.summary;
			if (sheetsToProcess.includes('transactions')) sheets.transactions = txResult.summary;

			const rows: ImportBundleDryRunRow[] = [
				...casesResult.preview.map((r) => ({ ...r, sheet: 'cases' as const })),
				...apptResult.preview.map((r) => ({ ...r, sheet: 'appointments' as const })),
				...txResult.preview.map((r) => ({ ...r, sheet: 'transactions' as const }))
			];
			rows.sort((a, b) => {
				const rank = (x: ImportBundleDryRunRow) =>
					x.action === 'error' ? 0 : x.action === 'create' ? 1 : x.action === 'update' ? 2 : 3;
				return rank(a) - rank(b);
			});

			if (summary.error > 0) {
				return {
					plan_token: null,
					expires_at: null,
					summary,
					sheets,
					rows: rows.slice(0, PREVIEW_ROW_CAP)
				};
			}

			const exp = Date.now() + IMPORT_PLAN_TTL_MS;
			const plan: BundleImportPlan = {
				v: 1,
				kind: 'bundle',
				tenant_id: tenantId,
				exp,
				cases: casesResult.planRows,
				appointments: apptResult.planRows,
				transactions: txResult.planRows
			};
			const plan_token = this.crypto.encrypt(JSON.stringify(plan)).toString('base64url');
			return {
				plan_token,
				expires_at: new Date(exp).toISOString(),
				summary,
				sheets,
				rows: rows.slice(0, PREVIEW_ROW_CAP)
			};
		});
	}

	async bundleCommit(
		tenantId: string,
		planToken: string,
		actor: AuditActor
	): Promise<ImportBundleCommitResult> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) =>
			this.bundleCommitWithDb(db, tenantId, planToken, actor)
		);
	}

	async bundleCommitWithDb(
		db: TenantDb,
		tenantId: string,
		planToken: string,
		actor: AuditActor
	): Promise<ImportBundleCommitResult> {
		const plan = this.decryptBundlePlan(tenantId, planToken);

		const casesResult: ImportCommitResult = { created: 0, updated: 0, unchanged: 0 };
		for (const row of plan.cases) {
			if (row.action === 'unchanged') {
				casesResult.unchanged += 1;
				continue;
			}
			const typeName = await this.requireContactTypeName(db, row.fields.contact_type_id);
			const firstName = row.fields.first_name.trim();
			const lastName = row.fields.last_name?.trim() || null;
			const displayName = deriveDisplayName(firstName, lastName);
			const values = {
				contactTypeId: row.fields.contact_type_id,
				contactTypeName: typeName,
				firstName,
				lastName,
				displayName,
				phone: row.fields.phone ?? null,
				email: row.fields.email ?? null,
				notes: row.fields.notes ?? null,
				organizationId: null,
				status: row.fields.status ?? null,
				assignedUserId: null,
				source: row.fields.source ?? null,
				medium: row.fields.medium ?? null,
				campaign: row.fields.campaign ?? null,
				referredByContactId: null,
				isInternal: false
			};

			if (row.action === 'create') {
				const [inserted] = await db
					.insert(contacts)
					.values({ tenantId, ...values })
					.returning({ id: contacts.id });
				if (!inserted) {
					throw new BadRequestException({
						error: { code: 'import_failed', message: `Insert failed at case row ${row.row_number}` }
					});
				}
				await db.insert(externalIds).values({
					tenantId,
					source: IMPORT_EXTERNAL_SOURCE,
					entityType: 'contact',
					externalId: row.external_id,
					internalId: inserted.id
				});
				casesResult.created += 1;
			} else {
				const contactId = row.contact_id;
				if (!contactId) {
					throw new BadRequestException({
						error: {
							code: 'import_failed',
							message: `Missing contact_id for case update at row ${row.row_number}`
						}
					});
				}
				const [existing] = await db
					.select({ id: contacts.id })
					.from(contacts)
					.where(
						and(
							eq(contacts.id, contactId),
							eq(contacts.tenantId, tenantId),
							isNull(contacts.deletedAt)
						)
					)
					.limit(1);
				if (!existing) {
					throw new BadRequestException({
						error: {
							code: 'import_failed',
							message: `Contact disappeared before commit (row ${row.row_number})`
						}
					});
				}
				await db
					.update(contacts)
					.set({ ...values, updatedAt: new Date() })
					.where(eq(contacts.id, contactId));
				await this.ensureExternalId(db, tenantId, row.external_id, contactId, 'contact');
				casesResult.updated += 1;
			}
		}

		const contactExtRows = await db
			.select({ externalId: externalIds.externalId, internalId: externalIds.internalId })
			.from(externalIds)
			.where(
				and(
					eq(externalIds.tenantId, tenantId),
					eq(externalIds.source, IMPORT_EXTERNAL_SOURCE),
					eq(externalIds.entityType, 'contact')
				)
			);
		const contactByExternal = new Map(contactExtRows.map((e) => [e.externalId, e.internalId]));

		const resolveContactId = (ref: { kind: 'id' | 'external_id'; value: string }): string => {
			if (ref.kind === 'id') return ref.value;
			const id = contactByExternal.get(ref.value);
			if (!id) {
				throw new BadRequestException({
					error: { code: 'import_failed', message: `Unresolved contact reference: ${ref.value}` }
				});
			}
			return id;
		};

		const apptResult: ImportCommitResult = { created: 0, updated: 0, unchanged: 0 };
		for (const row of plan.appointments) {
			if (row.action === 'unchanged') {
				apptResult.unchanged += 1;
				continue;
			}
			const contactId = resolveContactId(row.contact_ref);
			const [contact] = await db
				.select({ displayName: contacts.displayName })
				.from(contacts)
				.where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
				.limit(1);
			if (!contact) {
				throw new BadRequestException({
					error: {
						code: 'import_failed',
						message: `Contact not found for appointment row ${row.row_number}`
					}
				});
			}
			const clinicContactId = row.clinic_contact_external_id
				? (contactByExternal.get(row.clinic_contact_external_id) ?? null)
				: null;
			const hotelContactId = row.hotel_contact_external_id
				? (contactByExternal.get(row.hotel_contact_external_id) ?? null)
				: null;
			const transferContactId = row.transfer_contact_external_id
				? (contactByExternal.get(row.transfer_contact_external_id) ?? null)
				: null;

			const values = {
				contactId,
				contactDisplayName: contact.displayName,
				title: row.fields.title,
				appointmentType: row.fields.appointment_type,
				status: row.fields.status,
				startsAt: new Date(row.fields.starts_at),
				endsAt: row.fields.ends_at ? new Date(row.fields.ends_at) : null,
				clinicName: row.fields.clinic_name,
				hotelName: row.fields.hotel_name,
				transferNote: row.fields.transfer_note,
				clinicContactId,
				hotelContactId,
				transferContactId,
				notes: row.fields.notes
			};

			if (row.action === 'create') {
				const [inserted] = await db
					.insert(appointments)
					.values({ tenantId, ...values })
					.returning({ id: appointments.id });
				if (!inserted) {
					throw new BadRequestException({
						error: {
							code: 'import_failed',
							message: `Insert failed at appointment row ${row.row_number}`
						}
					});
				}
				await db.insert(externalIds).values({
					tenantId,
					source: IMPORT_EXTERNAL_SOURCE,
					entityType: 'appointment',
					externalId: row.external_id,
					internalId: inserted.id
				});
				apptResult.created += 1;
			} else {
				const appointmentId = row.appointment_id;
				if (!appointmentId) {
					throw new BadRequestException({
						error: {
							code: 'import_failed',
							message: `Missing appointment_id for update at row ${row.row_number}`
						}
					});
				}
				const [existing] = await db
					.select({ id: appointments.id })
					.from(appointments)
					.where(
						and(
							eq(appointments.id, appointmentId),
							eq(appointments.tenantId, tenantId),
							isNull(appointments.deletedAt)
						)
					)
					.limit(1);
				if (!existing) {
					throw new BadRequestException({
						error: {
							code: 'import_failed',
							message: `Appointment disappeared before commit (row ${row.row_number})`
						}
					});
				}
				await db
					.update(appointments)
					.set({ ...values, updatedAt: new Date() })
					.where(eq(appointments.id, appointmentId));
				await this.ensureExternalId(db, tenantId, row.external_id, appointmentId, 'appointment');
				apptResult.updated += 1;
			}
		}

		const [tenantRow] = await db
			.select({ baseCurrency: tenants.baseCurrency })
			.from(tenants)
			.where(eq(tenants.id, tenantId))
			.limit(1);
		const tenantBase = tenantRow?.baseCurrency ?? 'TRY';

		const txResult: ImportCommitResult = { created: 0, updated: 0, unchanged: 0 };
		for (const row of plan.transactions) {
			if (row.action === 'unchanged') {
				txResult.unchanged += 1;
				continue;
			}

			let contactId: string | null = null;
			let contactLabel: string | null = null;
			let contactDisplayName: string | null = null;
			const contactRef = row.contact_ref;
			if (contactRef) {
				if (contactRef.kind === 'label') {
					contactLabel = contactRef.value;
				} else {
					contactId = resolveContactId(contactRef as { kind: 'id' | 'external_id'; value: string });
					const [c] = await db
						.select({ displayName: contacts.displayName })
						.from(contacts)
						.where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
						.limit(1);
					if (!c) {
						throw new BadRequestException({
							error: {
								code: 'import_failed',
								message: `Contact not found for transaction row ${row.row_number}`
							}
						});
					}
					contactDisplayName = c.displayName;
					contactLabel = c.displayName;
				}
			}

			let caseContactId: string | null = null;
			if (row.case_contact_ref) {
				caseContactId = resolveContactId(row.case_contact_ref);
				await this.assertContactType(db, caseContactId, HASTA_TYPE, 'case_contact', row.row_number);
			}

			let responsibleContactId: string | null = null;
			if (row.responsible_contact_ref) {
				responsibleContactId = resolveContactId(row.responsible_contact_ref);
				await this.assertContactType(
					db,
					responsibleContactId,
					PERSONEL_TYPE,
					'responsible_contact',
					row.row_number
				);
			}

			let amountBase = row.fields.amount_base;
			let baseCurrency: string | null = amountBase !== null ? tenantBase : null;
			if (amountBase === null && row.fields.currency === tenantBase) {
				amountBase = row.fields.amount;
				baseCurrency = tenantBase;
			}

			const values = {
				kind: row.fields.kind,
				title: row.fields.title,
				subtitle: row.fields.subtitle,
				category: row.fields.category,
				occurredOn: row.fields.occurred_on,
				status: row.fields.status,
				invoiceStatus: row.fields.invoice_status,
				paymentMethod: row.fields.payment_method,
				amount: row.fields.amount,
				paidAmount: row.fields.paid_amount,
				currency: row.fields.currency,
				amountBase,
				baseCurrency,
				fxRate: row.fields.fx_rate,
				fxDated: row.fields.fx_dated,
				contactId,
				contactDisplayName,
				contactLabel,
				caseContactId,
				responsibleContactId,
				description: row.fields.description
			};

			if (row.action === 'create') {
				const [inserted] = await db
					.insert(transactions)
					.values({ tenantId, ...values })
					.returning({ id: transactions.id });
				if (!inserted) {
					throw new BadRequestException({
						error: {
							code: 'import_failed',
							message: `Insert failed at transaction row ${row.row_number}`
						}
					});
				}
				await db.insert(externalIds).values({
					tenantId,
					source: IMPORT_EXTERNAL_SOURCE,
					entityType: 'transaction',
					externalId: row.external_id,
					internalId: inserted.id
				});
				txResult.created += 1;
			} else {
				const transactionId = row.transaction_id;
				if (!transactionId) {
					throw new BadRequestException({
						error: {
							code: 'import_failed',
							message: `Missing transaction_id for update at row ${row.row_number}`
						}
					});
				}
				const [existing] = await db
					.select({ id: transactions.id })
					.from(transactions)
					.where(
						and(
							eq(transactions.id, transactionId),
							eq(transactions.tenantId, tenantId),
							isNull(transactions.deletedAt)
						)
					)
					.limit(1);
				if (!existing) {
					throw new BadRequestException({
						error: {
							code: 'import_failed',
							message: `Transaction disappeared before commit (row ${row.row_number})`
						}
					});
				}
				await db
					.update(transactions)
					.set({ ...values, updatedAt: new Date() })
					.where(eq(transactions.id, transactionId));
				await this.ensureExternalId(db, tenantId, row.external_id, transactionId, 'transaction');
				txResult.updated += 1;
			}
		}

		await writeAuditLog(
			db,
			tenantId,
			actor,
			'create',
			'tenant',
			`xlsx_import:bundle:cases=${casesResult.created}/${casesResult.updated},appointments=${apptResult.created}/${apptResult.updated},transactions=${txResult.created}/${txResult.updated}`
		);

		return { cases: casesResult, appointments: apptResult, transactions: txResult };
	}

	private decryptBundlePlan(tenantId: string, planToken: string): BundleImportPlan {
		let json: string;
		try {
			json = this.crypto.decrypt(Buffer.from(planToken, 'base64url'));
		} catch {
			throw new BadRequestException({
				error: { code: 'invalid_plan_token', message: 'Import plan token is invalid' }
			});
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(json);
		} catch {
			throw new BadRequestException({
				error: { code: 'invalid_plan_token', message: 'Import plan token is corrupt' }
			});
		}
		const plan = bundleImportPlanSchema.safeParse(parsed);
		if (!plan.success) {
			throw new BadRequestException({
				error: { code: 'invalid_plan_token', message: 'Import plan schema mismatch' }
			});
		}
		if (plan.data.tenant_id !== tenantId) {
			throw new BadRequestException({
				error: { code: 'invalid_plan_token', message: 'Import plan tenant mismatch' }
			});
		}
		if (plan.data.exp < Date.now()) {
			throw new BadRequestException({
				error: { code: 'plan_expired', message: 'Import plan expired — run dry-run again' }
			});
		}
		return plan.data;
	}

	private async loadBundleWorkbook(data: Buffer): Promise<ExcelJS.Workbook> {
		try {
			return await loadWorkbook(data);
		} catch {
			throw new BadRequestException({
				error: { code: 'invalid_workbook', message: 'File is not a valid .xlsx workbook' }
			});
		}
	}

	private getBundleWorksheet(
		wb: ExcelJS.Workbook,
		sheet: BundleSheet
	): ExcelJS.Worksheet | undefined {
		for (const name of BUNDLE_SHEET_NAMES[sheet]) {
			const ws = wb.getWorksheet(name);
			if (ws) return ws;
		}
		return undefined;
	}

	private readBundleSheetOrThrow(
		wb: ExcelJS.Workbook,
		sheet: BundleSheet,
		headers: readonly string[],
		aliases: Record<string, string>
	): Array<{ row_number: number; cells: Record<string, string> }> {
		const ws = this.getBundleWorksheet(wb, sheet);
		if (!ws) {
			throw new BadRequestException({
				error: { code: 'invalid_workbook', message: `${sheet} sheet not found` }
			});
		}
		const { rows } = sheetToObjects(ws, headers, aliases);
		if (rows.length > IMPORT_MAX_ROWS) {
			throw new BadRequestException({
				error: {
					code: 'too_many_rows',
					message: `Import exceeds ${IMPORT_MAX_ROWS} row limit`
				}
			});
		}
		return rows.map((cells, i) => ({ row_number: i + 2, cells }));
	}

	private async classifyCaseRows(
		db: TenantDb,
		tenantId: string,
		rawRows: Array<{ row_number: number; cells: Record<string, string> }>
	): Promise<{
		preview: ImportDryRunRow[];
		planRows: ContactImportPlanRow[];
		summary: ImportDryRunSummary;
	}> {
		const summary: ImportDryRunSummary = {
			total_rows: rawRows.length,
			create: 0,
			update: 0,
			unchanged: 0,
			error: 0
		};
		const preview: ImportDryRunRow[] = [];
		const planRows: ContactImportPlanRow[] = [];
		if (rawRows.length === 0) return { preview, planRows, summary };

		const types = await db
			.select({ id: contactTypes.id, name: contactTypes.name })
			.from(contactTypes)
			.where(eq(contactTypes.tenantId, tenantId));
		const hasta = types.find((t) => t.name.trim().toLowerCase() === HASTA_TYPE.toLowerCase());
		if (!hasta) {
			throw new BadRequestException({
				error: {
					code: 'missing_contact_type',
					message: `${HASTA_TYPE} contact type is not configured for this tenant`
				}
			});
		}

		const existingContacts = await db
			.select({
				id: contacts.id,
				email: contacts.email,
				phone: contacts.phone,
				firstName: contacts.firstName,
				lastName: contacts.lastName
			})
			.from(contacts)
			.where(and(eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)));
		const byId = new Map(existingContacts.map((c) => [c.id, c]));
		const byEmail = new Map(
			existingContacts
				.filter((c) => c.email)
				.map((c) => [c.email!.trim().toLowerCase(), c] as const)
		);
		const byPhone = new Map(
			existingContacts.filter((c) => c.phone).map((c) => [c.phone!.trim(), c] as const)
		);

		const extRows = await db
			.select({ externalId: externalIds.externalId, internalId: externalIds.internalId })
			.from(externalIds)
			.where(
				and(
					eq(externalIds.tenantId, tenantId),
					eq(externalIds.source, IMPORT_EXTERNAL_SOURCE),
					eq(externalIds.entityType, 'contact')
				)
			);
		const byExternal = new Map(extRows.map((e) => [e.externalId, e.internalId]));

		const seenExternal = new Set<string>();

		for (const { row_number, cells } of rawRows) {
			const errors: string[] = [];
			const firstName = (cells.first_name ?? '').trim();
			if (!firstName) errors.push('first_name is required');

			let status: string | null = null;
			const statusRaw = (cells.status ?? '').trim();
			if (statusRaw) {
				const st = contactStatusSchema.safeParse(statusRaw);
				if (!st.success) errors.push(`invalid status: ${statusRaw}`);
				else status = st.data;
			}

			const emailRaw = (cells.email ?? '').trim().toLowerCase() || null;
			const phoneRaw = (cells.phone ?? '').trim() || null;
			const lastName = (cells.last_name ?? '').trim() || null;

			if (emailRaw) {
				const emailCheck = contactCreateSchema.shape.email.safeParse(emailRaw);
				if (!emailCheck.success) errors.push('invalid email');
			}

			const externalId = (cells.external_id ?? '').trim() || contentExternalIdForCase(cells);
			if (seenExternal.has(externalId)) {
				errors.push(`duplicate external_id in file: ${externalId}`);
			}
			seenExternal.add(externalId);

			const idRaw = (cells.id ?? '').trim();
			let match = idRaw && byId.has(idRaw) ? byId.get(idRaw) : undefined;
			if (!match && byExternal.has(externalId)) match = byId.get(byExternal.get(externalId)!);
			if (!match && emailRaw && byEmail.has(emailRaw)) match = byEmail.get(emailRaw);
			if (!match && phoneRaw && byPhone.has(phoneRaw)) match = byPhone.get(phoneRaw);

			const fieldsCandidate = {
				contact_type_id: hasta.id,
				first_name: firstName || 'x',
				last_name: lastName,
				phone: phoneRaw,
				email: emailRaw,
				notes: (cells.notes ?? '').trim() || null,
				organization_id: null,
				status: status as never,
				source: (cells.source ?? '').trim() || null,
				medium: (cells.medium ?? '').trim() || null,
				campaign: (cells.campaign ?? '').trim() || null,
				is_internal: false
			};

			const validated = contactCreateSchema.safeParse(fieldsCandidate);
			if (!validated.success && errors.length === 0) {
				errors.push(...validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
			}

			const label = deriveDisplayName(firstName || '?', lastName) || null;

			if (errors.length > 0) {
				summary.error += 1;
				preview.push({ row_number, action: 'error', external_id: externalId, label, errors });
				continue;
			}

			const fields = validated.success
				? validated.data
				: contactCreateSchema.parse(fieldsCandidate);
			const action: 'create' | 'update' = match ? 'update' : 'create';
			if (action === 'create') summary.create += 1;
			else summary.update += 1;

			planRows.push({
				row_number,
				action,
				external_id: externalId,
				contact_id: match?.id ?? null,
				fields
			});
			preview.push({ row_number, action, external_id: externalId, label, errors: [] });
		}

		return { preview, planRows, summary };
	}

	private async classifyAppointmentRows(
		db: TenantDb,
		tenantId: string,
		rawRows: Array<{ row_number: number; cells: Record<string, string> }>,
		caseRows: ContactImportPlanRow[]
	): Promise<{
		preview: ImportDryRunRow[];
		planRows: AppointmentImportPlanRow[];
		summary: ImportDryRunSummary;
	}> {
		const summary: ImportDryRunSummary = {
			total_rows: rawRows.length,
			create: 0,
			update: 0,
			unchanged: 0,
			error: 0
		};
		const preview: ImportDryRunRow[] = [];
		const planRows: AppointmentImportPlanRow[] = [];
		if (rawRows.length === 0) return { preview, planRows, summary };

		const existingContacts = await db
			.select({ id: contacts.id, email: contacts.email })
			.from(contacts)
			.where(and(eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)));
		const contactById = new Set(existingContacts.map((c) => c.id));
		const contactByEmail = new Map(
			existingContacts
				.filter((c) => c.email)
				.map((c) => [c.email!.trim().toLowerCase(), c.id] as const)
		);

		const contactExtRows = await db
			.select({ externalId: externalIds.externalId })
			.from(externalIds)
			.where(
				and(
					eq(externalIds.tenantId, tenantId),
					eq(externalIds.source, IMPORT_EXTERNAL_SOURCE),
					eq(externalIds.entityType, 'contact')
				)
			);
		const knownContactExternal = new Set(contactExtRows.map((e) => e.externalId));
		for (const row of caseRows) knownContactExternal.add(row.external_id);

		const existingAppointments = await db
			.select({ id: appointments.id })
			.from(appointments)
			.where(and(eq(appointments.tenantId, tenantId), isNull(appointments.deletedAt)));
		const appointmentIds = new Set(existingAppointments.map((a) => a.id));

		const apptExtRows = await db
			.select({ externalId: externalIds.externalId, internalId: externalIds.internalId })
			.from(externalIds)
			.where(
				and(
					eq(externalIds.tenantId, tenantId),
					eq(externalIds.source, IMPORT_EXTERNAL_SOURCE),
					eq(externalIds.entityType, 'appointment')
				)
			);
		const apptByExternal = new Map(apptExtRows.map((e) => [e.externalId, e.internalId]));

		const seenExternal = new Set<string>();

		for (const { row_number, cells } of rawRows) {
			const errors: string[] = [];

			let contactRef: { kind: 'id' | 'external_id'; value: string } | null = null;
			const contactIdRaw = (cells.contact_id ?? '').trim();
			const contactExtRaw = (cells.contact_external_id ?? '').trim();
			const contactEmailRaw = (cells.contact_email ?? '').trim().toLowerCase();

			if (contactIdRaw) {
				if (!contactById.has(contactIdRaw)) errors.push(`unknown contact_id: ${contactIdRaw}`);
				else contactRef = { kind: 'id', value: contactIdRaw };
			} else if (contactExtRaw) {
				if (!knownContactExternal.has(contactExtRaw)) {
					errors.push(`unknown contact_external_id: ${contactExtRaw}`);
				} else contactRef = { kind: 'external_id', value: contactExtRaw };
			} else if (contactEmailRaw) {
				const id = contactByEmail.get(contactEmailRaw);
				if (!id) errors.push(`unknown contact_email: ${contactEmailRaw}`);
				else contactRef = { kind: 'id', value: id };
			} else {
				errors.push(
					'contact reference required (contact_id, contact_external_id, or contact_email)'
				);
			}

			let status: AppointmentStatus = 'scheduled';
			const statusRaw = (cells.status ?? '').trim();
			if (statusRaw) {
				const st = appointmentStatusSchema.safeParse(statusRaw);
				if (!st.success) errors.push(`invalid status: ${statusRaw}`);
				else status = st.data;
			}

			const startsAtRaw = (cells.starts_at ?? '').trim();
			let startsAt: string | null = null;
			if (!startsAtRaw) errors.push('starts_at is required');
			else {
				startsAt = parseIsoDateTimeCell(startsAtRaw);
				if (!startsAt) errors.push(`invalid starts_at: ${startsAtRaw}`);
			}

			const endsAtRaw = (cells.ends_at ?? '').trim();
			let endsAt: string | null = null;
			if (endsAtRaw) {
				endsAt = parseIsoDateTimeCell(endsAtRaw);
				if (!endsAt) errors.push(`invalid ends_at: ${endsAtRaw}`);
			}

			const resolveOptionalContactExternal = (raw: string, field: string): string | null => {
				const v = raw.trim();
				if (!v) return null;
				if (!knownContactExternal.has(v)) {
					errors.push(`unknown ${field}: ${v}`);
					return null;
				}
				return v;
			};
			const clinicExt = resolveOptionalContactExternal(
				cells.clinic_contact_external_id ?? '',
				'clinic_contact_external_id'
			);
			const hotelExt = resolveOptionalContactExternal(
				cells.hotel_contact_external_id ?? '',
				'hotel_contact_external_id'
			);
			const transferExt = resolveOptionalContactExternal(
				cells.transfer_contact_external_id ?? '',
				'transfer_contact_external_id'
			);

			const externalId = (cells.external_id ?? '').trim() || contentExternalIdForAppointment(cells);
			if (seenExternal.has(externalId)) {
				errors.push(`duplicate external_id in file: ${externalId}`);
			}
			seenExternal.add(externalId);

			const idRaw = (cells.id ?? '').trim();
			let matchId: string | null = null;
			if (idRaw && appointmentIds.has(idRaw)) matchId = idRaw;
			else if (apptByExternal.has(externalId)) matchId = apptByExternal.get(externalId)!;

			const title = (cells.title ?? '').trim() || null;
			const label = title ?? contactExtRaw ?? contactIdRaw ?? contactEmailRaw ?? null;

			if (errors.length > 0) {
				summary.error += 1;
				preview.push({ row_number, action: 'error', external_id: externalId, label, errors });
				continue;
			}

			const fields = {
				title,
				appointment_type: (cells.appointment_type ?? '').trim() || null,
				status,
				starts_at: startsAt!,
				ends_at: endsAt,
				clinic_name: (cells.clinic_name ?? '').trim() || null,
				hotel_name: (cells.hotel_name ?? '').trim() || null,
				transfer_note: (cells.transfer_note ?? '').trim() || null,
				notes: (cells.notes ?? '').trim() || null
			};

			const action: 'create' | 'update' = matchId ? 'update' : 'create';
			if (action === 'create') summary.create += 1;
			else summary.update += 1;

			planRows.push({
				row_number,
				action,
				external_id: externalId,
				appointment_id: matchId,
				contact_ref: contactRef!,
				clinic_contact_external_id: clinicExt,
				hotel_contact_external_id: hotelExt,
				transfer_contact_external_id: transferExt,
				fields
			});
			preview.push({ row_number, action, external_id: externalId, label, errors: [] });
		}

		return { preview, planRows, summary };
	}

	private async classifyTransactionRows(
		db: TenantDb,
		tenantId: string,
		rawRows: Array<{ row_number: number; cells: Record<string, string> }>,
		caseRows: ContactImportPlanRow[]
	): Promise<{
		preview: ImportDryRunRow[];
		planRows: TransactionImportPlanRow[];
		summary: ImportDryRunSummary;
	}> {
		const summary: ImportDryRunSummary = {
			total_rows: rawRows.length,
			create: 0,
			update: 0,
			unchanged: 0,
			error: 0
		};
		const preview: ImportDryRunRow[] = [];
		const planRows: TransactionImportPlanRow[] = [];
		if (rawRows.length === 0) return { preview, planRows, summary };

		const existingContacts = await db
			.select({ id: contacts.id, contactTypeName: contacts.contactTypeName })
			.from(contacts)
			.where(and(eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)));
		const contactTypeById = new Map(existingContacts.map((c) => [c.id, c.contactTypeName]));

		const contactExtRows = await db
			.select({ externalId: externalIds.externalId, internalId: externalIds.internalId })
			.from(externalIds)
			.where(
				and(
					eq(externalIds.tenantId, tenantId),
					eq(externalIds.source, IMPORT_EXTERNAL_SOURCE),
					eq(externalIds.entityType, 'contact')
				)
			);
		const contactExternalToInternal = new Map(
			contactExtRows.map((e) => [e.externalId, e.internalId])
		);
		const pendingCaseExternal = new Set(caseRows.map((r) => r.external_id));

		const contactTypeForExternal = (extId: string): string | undefined => {
			if (pendingCaseExternal.has(extId)) return HASTA_TYPE;
			const internal = contactExternalToInternal.get(extId);
			return internal ? contactTypeById.get(internal) : undefined;
		};
		const knownContactExternal = new Set([
			...contactExternalToInternal.keys(),
			...pendingCaseExternal
		]);

		const existingTransactions = await db
			.select({ id: transactions.id })
			.from(transactions)
			.where(and(eq(transactions.tenantId, tenantId), isNull(transactions.deletedAt)));
		const transactionIds = new Set(existingTransactions.map((t) => t.id));

		const txExtRows = await db
			.select({ externalId: externalIds.externalId, internalId: externalIds.internalId })
			.from(externalIds)
			.where(
				and(
					eq(externalIds.tenantId, tenantId),
					eq(externalIds.source, IMPORT_EXTERNAL_SOURCE),
					eq(externalIds.entityType, 'transaction')
				)
			);
		const txByExternal = new Map(txExtRows.map((e) => [e.externalId, e.internalId]));

		const seenExternal = new Set<string>();

		for (const { row_number, cells } of rawRows) {
			const errors: string[] = [];

			const kindRaw = (cells.kind ?? '').trim();
			const kindParsed = transactionKindSchema.safeParse(kindRaw);
			if (!kindParsed.success) errors.push(`invalid kind: ${kindRaw || '(empty)'}`);

			const occurredOnRaw = (cells.occurred_on ?? '').trim();
			let occurredOn: string | null = null;
			if (!occurredOnRaw) errors.push('occurred_on is required');
			else {
				occurredOn = parseIsoDateCell(occurredOnRaw);
				if (!occurredOn) errors.push(`invalid occurred_on: ${occurredOnRaw}`);
			}

			let status: TransactionStatus | null = null;
			const statusRaw = (cells.status ?? '').trim();
			const statusParsed = transactionStatusSchema.safeParse(statusRaw);
			if (!statusParsed.success) errors.push(`invalid status: ${statusRaw || '(empty)'}`);
			else status = statusParsed.data;

			let invoiceStatus: InvoiceStatus = 'none';
			const invoiceRaw = (cells.invoice_status ?? '').trim();
			if (invoiceRaw) {
				const inv = invoiceStatusSchema.safeParse(invoiceRaw);
				if (!inv.success) errors.push(`invalid invoice_status: ${invoiceRaw}`);
				else invoiceStatus = inv.data;
			}

			const amountRaw = (cells.amount ?? '').trim();
			let amount: number | null = null;
			if (!amountRaw) errors.push('amount is required');
			else {
				const n = Number(amountRaw);
				if (!Number.isFinite(n) || !Number.isInteger(n)) {
					errors.push(`amount must be an integer minor-unit value, got: ${amountRaw}`);
				} else if (n <= 0) {
					errors.push('amount must be positive');
				} else amount = n;
			}

			let paidAmount: number | null = null;
			const paidRaw = (cells.paid_amount ?? '').trim();
			if (paidRaw) {
				const n = Number(paidRaw);
				if (!Number.isFinite(n) || !Number.isInteger(n)) {
					errors.push(`paid_amount must be an integer minor-unit value, got: ${paidRaw}`);
				} else paidAmount = n;
			}

			let currency: SupportedCurrency = 'TRY';
			const currencyRaw = (cells.currency ?? '').trim().toUpperCase();
			if (currencyRaw) {
				const cur = supportedCurrencySchema.safeParse(currencyRaw);
				if (!cur.success) errors.push(`invalid currency: ${currencyRaw}`);
				else currency = cur.data;
			}

			let amountBase: number | null = null;
			const amountBaseRaw = (cells.amount_base ?? '').trim();
			if (amountBaseRaw) {
				const n = Number(amountBaseRaw);
				if (!Number.isFinite(n) || !Number.isInteger(n)) {
					errors.push(`amount_base must be an integer minor-unit value, got: ${amountBaseRaw}`);
				} else amountBase = n;
			}

			let fxRate: number | null = null;
			const fxRateRaw = (cells.fx_rate ?? '').trim();
			if (fxRateRaw) {
				const n = Number(fxRateRaw);
				if (!Number.isFinite(n) || n <= 0) errors.push(`invalid fx_rate: ${fxRateRaw}`);
				else fxRate = n;
			}

			let fxDated: string | null = null;
			const fxDatedRaw = (cells.fx_dated ?? '').trim();
			if (fxDatedRaw) {
				fxDated = parseIsoDateCell(fxDatedRaw);
				if (!fxDated) errors.push(`invalid fx_dated: ${fxDatedRaw}`);
			}

			const paymentMethod = (cells.payment_method ?? '').trim() || null;

			let contactRef: { kind: 'id' | 'external_id' | 'label'; value: string } | null = null;
			const contactIdRaw = (cells.contact_id ?? '').trim();
			const contactExtRaw = (cells.contact_external_id ?? '').trim();
			const contactLabelRaw = (cells.contact_label ?? '').trim();
			if (contactIdRaw) {
				if (!contactTypeById.has(contactIdRaw)) errors.push(`unknown contact_id: ${contactIdRaw}`);
				else contactRef = { kind: 'id', value: contactIdRaw };
			} else if (contactExtRaw) {
				if (!knownContactExternal.has(contactExtRaw)) {
					errors.push(`unknown contact_external_id: ${contactExtRaw}`);
				} else contactRef = { kind: 'external_id', value: contactExtRaw };
			} else if (contactLabelRaw) {
				contactRef = { kind: 'label', value: contactLabelRaw };
			}

			let caseContactRef: { kind: 'id' | 'external_id'; value: string } | null = null;
			const caseIdRaw = (cells.case_contact_id ?? '').trim();
			const caseExtRaw = (cells.case_contact_external_id ?? '').trim();
			if (caseIdRaw) {
				const type = contactTypeById.get(caseIdRaw);
				if (!type) errors.push(`unknown case_contact_id: ${caseIdRaw}`);
				else if (type !== HASTA_TYPE) {
					errors.push(`case_contact_id must reference a ${HASTA_TYPE} contact`);
				} else caseContactRef = { kind: 'id', value: caseIdRaw };
			} else if (caseExtRaw) {
				const type = contactTypeForExternal(caseExtRaw);
				if (!type) errors.push(`unknown case_contact_external_id: ${caseExtRaw}`);
				else if (type !== HASTA_TYPE) {
					errors.push(`case_contact_external_id must reference a ${HASTA_TYPE} contact`);
				} else caseContactRef = { kind: 'external_id', value: caseExtRaw };
			}

			let responsibleContactRef: { kind: 'id' | 'external_id'; value: string } | null = null;
			const respIdRaw = (cells.responsible_contact_id ?? '').trim();
			const respExtRaw = (cells.responsible_contact_external_id ?? '').trim();
			if (respIdRaw) {
				const type = contactTypeById.get(respIdRaw);
				if (!type) errors.push(`unknown responsible_contact_id: ${respIdRaw}`);
				else if (type !== PERSONEL_TYPE) {
					errors.push(`responsible_contact_id must reference a ${PERSONEL_TYPE} contact`);
				} else responsibleContactRef = { kind: 'id', value: respIdRaw };
			} else if (respExtRaw) {
				const type = contactTypeForExternal(respExtRaw);
				if (!type) errors.push(`unknown responsible_contact_external_id: ${respExtRaw}`);
				else if (type !== PERSONEL_TYPE) {
					errors.push(`responsible_contact_external_id must reference a ${PERSONEL_TYPE} contact`);
				} else responsibleContactRef = { kind: 'external_id', value: respExtRaw };
			}

			const externalId = (cells.external_id ?? '').trim() || contentExternalIdForTransaction(cells);
			if (seenExternal.has(externalId)) {
				errors.push(`duplicate external_id in file: ${externalId}`);
			}
			seenExternal.add(externalId);

			const idRaw = (cells.id ?? '').trim();
			let matchId: string | null = null;
			if (idRaw && transactionIds.has(idRaw)) matchId = idRaw;
			else if (txByExternal.has(externalId)) matchId = txByExternal.get(externalId)!;

			const title = (cells.title ?? '').trim() || null;
			const category = (cells.category ?? '').trim() || null;
			const subtitle = (cells.subtitle ?? '').trim() || null;
			const label = title ?? ([category, subtitle].filter(Boolean).join(' › ') || null);

			if (errors.length > 0) {
				summary.error += 1;
				preview.push({ row_number, action: 'error', external_id: externalId, label, errors });
				continue;
			}

			const fields = {
				kind: kindParsed.data!,
				title,
				subtitle,
				category,
				occurred_on: occurredOn!,
				status: status!,
				invoice_status: invoiceStatus,
				payment_method: paymentMethod,
				amount: amount!,
				paid_amount: paidAmount,
				currency,
				amount_base: amountBase,
				fx_rate: fxRate,
				fx_dated: fxDated,
				description: (cells.description ?? '').trim() || null
			};

			const action: 'create' | 'update' = matchId ? 'update' : 'create';
			if (action === 'create') summary.create += 1;
			else summary.update += 1;

			planRows.push({
				row_number,
				action,
				external_id: externalId,
				transaction_id: matchId,
				contact_ref: contactRef,
				case_contact_ref: caseContactRef,
				responsible_contact_ref: responsibleContactRef,
				fields
			});
			preview.push({ row_number, action, external_id: externalId, label, errors: [] });
		}

		return { preview, planRows, summary };
	}
}
