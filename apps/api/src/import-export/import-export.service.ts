import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import {
	CONTACT_IMPORT_HEADERS,
	CONTACT_IMPORT_HEADER_ALIASES,
	IMPORT_EXTERNAL_SOURCE,
	IMPORT_MAX_ROWS,
	IMPORT_MAX_UPLOAD_BYTES,
	IMPORT_PLAN_TTL_MS,
	contactCreateSchema,
	contactImportPlanSchema,
	contactStatusSchema,
	type ContactImportPlan,
	type ContactImportPlanRow,
	type ImportCommitResult,
	type ImportDryRunResult,
	type ImportDryRunRow
} from '@verimaya/shared';
import ExcelJS from 'exceljs';
import { writeAuditLog, type AuditActor } from '../common/audit-helper';
import { CryptoService } from '../common/crypto.service';
import { contactTypes, contacts, externalIds, organizations } from '../db/schema';
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

	private async ensureExternalId(
		db: TenantDb,
		tenantId: string,
		externalId: string,
		internalId: string
	): Promise<void> {
		const [existing] = await db
			.select({ id: externalIds.id })
			.from(externalIds)
			.where(
				and(
					eq(externalIds.tenantId, tenantId),
					eq(externalIds.source, IMPORT_EXTERNAL_SOURCE),
					eq(externalIds.entityType, 'contact'),
					eq(externalIds.externalId, externalId)
				)
			)
			.limit(1);
		if (existing) return;
		await db.insert(externalIds).values({
			tenantId,
			source: IMPORT_EXTERNAL_SOURCE,
			entityType: 'contact',
			externalId,
			internalId
		});
	}
}
