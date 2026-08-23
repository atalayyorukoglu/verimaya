import { randomUUID } from 'node:crypto';
import {
	BadRequestException,
	ConflictException,
	Inject,
	Injectable,
	NotFoundException
} from '@nestjs/common';
import { and, asc, count, desc, eq, getTableColumns, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type {
	MergeRecords,
	ContactCaseNoteCreate,
	ContactCreate,
	ContactFileCreate,
	ContactFilePresign,
	ContactListQuery,
	ContactUpdate,
	ContactsBulkType
} from '@verimaya/shared';
import {
	DEFAULT_TENANT_TIMEZONE,
	DUPLICATE_SCAN_ROW_CAP,
	findContactDuplicateGroups,
	isInlineSafeContactFileMimeType,
	toTenantDayKey
} from '@verimaya/shared';
import { assertUploadMimeMatchesBytes } from './file-mime';
import {
	appointments,
	caseNotes,
	contactTitles,
	contactTypes,
	contacts,
	files,
	member,
	tenants,
	transactions
} from '../db/schema';
import { writeAuditLog, type AuditActor } from '../common/audit-helper';
import { isForeignKeyViolation } from '../common/postgres-errors';
import { resolveBaseAmount, resolvePaidBaseAmount } from '../common/finance-base';
import { buildContactListCursorPage, contactListCursorCondition } from '../common/list-query';
import { toContact, toContactCaseNote, toContactFile } from '../common/mappers';
import { textSearchCondition } from '../common/search';
import {
	FILE_STORAGE,
	DEFAULT_PRESIGN_TTL_SECONDS,
	MAX_UPLOAD_BYTES,
	PENDING_STORAGE_KEY,
	type FileStoragePort
} from '../storage/storage.types';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import {
	contactSortFirstNameExpr,
	contactSortFirstNameSql,
	contactSortLastNameExpr,
	contactSortLastNameSql
} from './contact-list-sort';

function deriveDisplayName(firstName: string, lastName: string | null | undefined): string {
	return `${firstName}${lastName?.trim() ? ` ${lastName.trim()}` : ''}`.trim();
}

function publicApiOrigin(): string {
	const raw =
		process.env.BETTER_AUTH_URL?.trim() ||
		process.env.ADS_OAUTH_REDIRECT_BASE?.trim() ||
		'http://localhost:3000';
	return raw.replace(/\/$/, '');
}

@Injectable()
export class ContactsService {
	constructor(
		private readonly tenantContext: TenantContextService,
		@Inject(FILE_STORAGE) private readonly storage: FileStoragePort
	) {}

	async list(tenantId: string, params: ContactListQuery) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const sortLastNameSql = contactSortLastNameSql();
			const sortFirstNameSql = contactSortFirstNameSql();
			const cursorCond = contactListCursorCondition(
				sortLastNameSql,
				sortFirstNameSql,
				contacts.id,
				params.cursor
			);
			const searchCond = textSearchCondition(params.q, [
				contacts.displayName,
				contacts.firstName,
				contacts.lastName,
				contacts.email,
				contacts.phone
			]);
			const baseFilters = [isNull(contacts.deletedAt)];
			if (searchCond) baseFilters.push(searchCond);
			if (params.type_id) baseFilters.push(eq(contacts.contactTypeId, params.type_id));
			if (params.title_id) baseFilters.push(eq(contacts.titleId, params.title_id));

			const [totalRow] = await db
				.select({ n: count() })
				.from(contacts)
				.where(and(...baseFilters));

			const pageFilters = [...baseFilters];
			if (cursorCond) pageFilters.push(cursorCond);

			const rows = await db
				.select({
					...getTableColumns(contacts),
					sort_last_name: contactSortLastNameExpr(),
					sort_first_name: contactSortFirstNameExpr()
				})
				.from(contacts)
				.where(and(...pageFilters))
				.orderBy(
					sql`${sortLastNameSql} ASC NULLS LAST`,
					sql`${sortFirstNameSql} ASC NULLS LAST`,
					asc(contacts.id)
				)
				.limit(params.limit + 1);

			const page = buildContactListCursorPage(rows, params.limit);
			return {
				items: page.items.map(toContact),
				next_cursor: page.next_cursor,
				total_count: Number(totalRow?.n ?? 0)
			};
		});
	}

	async get(tenantId: string, id: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const row = await this.findActiveRow(db, id);
			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Contact not found' }
				});
			}
			return toContact(row);
		});
	}

	async financeSummary(tenantId: string, contactId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const contact = await this.findActiveRow(db, contactId);
			if (!contact) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Contact not found' }
				});
			}

			const [tenant] = await db
				.select({ baseCurrency: tenants.baseCurrency })
				.from(tenants)
				.where(eq(tenants.id, tenantId))
				.limit(1);
			const tenantBase = tenant?.baseCurrency ?? 'TRY';

			const rows = await db
				.select({
					kind: transactions.kind,
					status: transactions.status,
					amount: transactions.amount,
					amountBase: transactions.amountBase,
					baseCurrency: transactions.baseCurrency,
					currency: transactions.currency,
					paidAmount: transactions.paidAmount
				})
				.from(transactions)
				.where(
					and(
						or(
							eq(transactions.contactId, contactId),
							eq(transactions.caseContactId, contactId)
						),
						isNull(transactions.deletedAt)
					)
				);

			let incomeBase = 0;
			let expenseBase = 0;
			let paidBase = 0;
			let outstandingBase = 0;

			for (const row of rows) {
				const base = resolveBaseAmount(row, tenantBase);
				if (base == null) continue;
				if (row.kind === 'income') {
					incomeBase += base;
					const paid = resolvePaidBaseAmount(row, tenantBase) ?? 0;
					paidBase += paid;
					outstandingBase += base - paid;
				} else {
					expenseBase += base;
				}
			}

			return {
				income_base: incomeBase,
				expense_base: expenseBase,
				net_base: incomeBase - expenseBase,
				paid_base: paidBase,
				outstanding_base: outstandingBase,
				transaction_count: rows.length
			};
		});
	}

	/**
	 * GAP-F09-22 (G-22): link unassigned transactions that share the patient's contact_id.
	 * Soft-deleted rows and transactions already linked to any patient are skipped.
	 * Repeat calls converge (`updated: 0` once nothing remains to link).
	 */
	async autoLinkTransactions(tenantId: string, contactId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) =>
			this.autoLinkTransactionsWithDb(db, contactId)
		);
	}

	async autoLinkTransactionsWithDb(db: TenantDb, contactId: string) {
		const contact = await this.findActiveRow(db, contactId);
		if (!contact) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}

		const updatedRows = await db
			.update(transactions)
			.set({
				contactId,
				contactDisplayName: contact.displayName,
				contactLabel: contact.displayName,
				updatedAt: new Date()
			})
			.where(
				and(
					isNull(transactions.contactId),
					eq(transactions.contactLabel, contact.displayName),
					isNull(transactions.deletedAt)
				)
			)
			.returning({ id: transactions.id });

		return { updated: updatedRows.length };
	}

	async listFiles(tenantId: string, contactId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const contact = await this.findActiveRow(db, contactId);
			if (!contact) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Contact not found' }
				});
			}

			const rows = await db
				.select()
				.from(files)
				.where(and(eq(files.contactId, contactId), isNull(files.deletedAt)))
				.orderBy(desc(files.createdAt), desc(files.id));

			return { items: rows.map(toContactFile) };
		});
	}

	async listCaseNotes(tenantId: string, contactId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const contact = await this.findActiveRow(db, contactId);
			if (!contact) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Contact not found' }
				});
			}

			const rows = await db
				.select()
				.from(caseNotes)
				.where(eq(caseNotes.contactId, contactId))
				.orderBy(asc(caseNotes.createdAt), asc(caseNotes.id));

			return { items: rows.map(toContactCaseNote) };
		});
	}

	async createCaseNoteWithDb(
		db: TenantDb,
		tenantId: string,
		contactId: string,
		input: ContactCaseNoteCreate,
		author: { displayName: string }
	) {
		const contact = await this.findActiveRow(db, contactId);
		if (!contact) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}

		const body = input.body.trim();
		const [row] = await db
			.insert(caseNotes)
			.values({
				tenantId,
				contactId,
				body,
				authorDisplayName: author.displayName.trim() || 'User'
			})
			.returning();

		return toContactCaseNote(row!);
	}

	async deleteCaseNoteWithDb(db: TenantDb, contactId: string, noteId: string) {
		const contact = await this.findActiveRow(db, contactId);
		if (!contact) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}

		const [row] = await db
			.delete(caseNotes)
			.where(and(eq(caseNotes.id, noteId), eq(caseNotes.contactId, contactId)))
			.returning({ id: caseNotes.id });

		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Case note not found' }
			});
		}

		return { ok: true as const };
	}

	async createFileWithDb(
		db: TenantDb,
		tenantId: string,
		contactId: string,
		input: ContactFileCreate,
		uploader: { userId: string; displayName: string },
		options?: {
			fileId?: string;
			storageKey?: string;
			sizeBytes?: number;
			status?: 'pending' | 'ready';
		}
	) {
		const contact = await this.findActiveRow(db, contactId);
		if (!contact) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}

		const { appointmentId, appointmentLabel } = await this.resolveAppointmentLink(
			db,
			tenantId,
			contactId,
			input.appointment_id ?? null
		);

		const fileId = options?.fileId ?? randomUUID();
		const storageKey = options?.storageKey ?? PENDING_STORAGE_KEY;
		const sizeBytes = options?.sizeBytes ?? input.size_bytes ?? 0;
		const status = options?.status ?? 'ready';

		const [row] = await db
			.insert(files)
			.values({
				id: fileId,
				tenantId,
				contactId,
				appointmentId,
				appointmentLabel,
				filename: input.filename,
				mimeType: input.mime_type ?? 'application/octet-stream',
				sizeBytes,
				status,
				storageKey,
				uploadedByUserId: uploader.userId,
				uploadedByDisplayName: uploader.displayName
			})
			.returning();

		return toContactFile(row!);
	}

	/**
	 * Create pending meta + return an upload URL (S3 presign, or local content PUT).
	 * Orphan pending rows (>24h) are swept by `files.sweep_pending` (Adım 30a).
	 */
	async presignFileWithDb(
		db: TenantDb,
		tenantId: string,
		contactId: string,
		input: ContactFilePresign,
		uploader: { userId: string; displayName: string }
	) {
		if (input.size_bytes > MAX_UPLOAD_BYTES) {
			throw new BadRequestException({
				error: {
					code: 'validation_error',
					message: `File exceeds ${MAX_UPLOAD_BYTES} byte limit`
				}
			});
		}

		const fileId = randomUUID();
		const storageKey = this.storage.buildKey(tenantId, contactId, fileId);
		const expiresIn = DEFAULT_PRESIGN_TTL_SECONDS;

		await this.createFileWithDb(
			db,
			tenantId,
			contactId,
			{
				filename: input.filename,
				mime_type: input.mime_type,
				size_bytes: input.size_bytes,
				appointment_id: input.appointment_id ?? null
			},
			uploader,
			{ fileId, storageKey, sizeBytes: input.size_bytes, status: 'pending' }
		);

		const signed = await this.storage.signedPutUrl(storageKey, expiresIn);
		const uploadUrl =
			signed ?? `${publicApiOrigin()}/v1/contacts/${contactId}/files/${fileId}/content`;

		return {
			file_id: fileId,
			upload_url: uploadUrl,
			storage_key: storageKey,
			expires_in: expiresIn
		};
	}

	/** Local-driver content upload (when signedPutUrl is unavailable). */
	async putFileContent(
		tenantId: string,
		contactId: string,
		fileId: string,
		data: Buffer,
		contentType?: string
	) {
		if (data.byteLength > MAX_UPLOAD_BYTES) {
			throw new BadRequestException({
				error: {
					code: 'validation_error',
					message: `File exceeds ${MAX_UPLOAD_BYTES} byte limit`
				}
			});
		}

		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const row = await this.findFileRow(db, contactId, fileId);
			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'File not found' }
				});
			}
			if (row.status !== 'pending') {
				throw new BadRequestException({
					error: { code: 'validation_error', message: 'File is not awaiting upload' }
				});
			}
			if (data.byteLength !== row.sizeBytes) {
				throw new BadRequestException({
					error: {
						code: 'validation_error',
						message: `Uploaded size ${data.byteLength} does not match declared ${row.sizeBytes}`
					}
				});
			}

			// AUDIT-F09-08: sniff before storage.put — covers local + S3 via RoutingFileStorage.
			const declaredMime = contentType ?? row.mimeType;
			const verifiedMime = await assertUploadMimeMatchesBytes(data, declaredMime);

			await this.storage.put(row.storageKey, data, {
				contentType: verifiedMime,
				filename: row.filename
			});

			return { accepted: true };
		});
	}

	async confirmFile(tenantId: string, contactId: string, fileId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const row = await this.findFileRow(db, contactId, fileId);
			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'File not found' }
				});
			}
			if (row.status === 'ready') {
				return toContactFile(row);
			}

			const objectStat = await this.storage.stat(row.storageKey);
			if (!objectStat) {
				throw new BadRequestException({
					error: {
						code: 'validation_error',
						message: 'Upload not found in storage — complete PUT before confirm'
					}
				});
			}
			if (objectStat.sizeBytes !== row.sizeBytes) {
				throw new BadRequestException({
					error: {
						code: 'validation_error',
						message: `Stored size ${objectStat.sizeBytes} does not match declared ${row.sizeBytes}`
					}
				});
			}

			const [updated] = await db
				.update(files)
				.set({
					status: 'ready',
					mimeType: objectStat.contentType ?? row.mimeType
				})
				.where(
					and(eq(files.id, fileId), eq(files.contactId, contactId), isNull(files.deletedAt))
				)
				.returning();

			return toContactFile(updated!);
		});
	}

	/** Active (non-soft-deleted) file under an active contact. */
	private async findFileRow(db: TenantDb, contactId: string, fileId: string) {
		const contact = await this.findActiveRow(db, contactId);
		if (!contact) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}
		const [row] = await db
			.select()
			.from(files)
			.where(
				and(eq(files.id, fileId), eq(files.contactId, contactId), isNull(files.deletedAt))
			)
			.limit(1);
		return row ?? null;
	}

	/**
	 * GAP-F09-23: soft-delete file meta + audit. Does not remove storage blob
	 * (RoutingFileStorage / FilesSweepService ownership).
	 * Second delete on same id → not_found (same as contacts/txns/appts).
	 */
	async softDeleteFileWithDb(
		db: TenantDb,
		tenantId: string,
		contactId: string,
		fileId: string,
		actor: AuditActor
	) {
		const existing = await this.findFileRow(db, contactId, fileId);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'File not found' }
			});
		}

		await db
			.update(files)
			.set({ deletedAt: new Date() })
			.where(and(eq(files.id, fileId), eq(files.contactId, contactId), isNull(files.deletedAt)));

		await writeAuditLog(db, tenantId, actor, 'delete', 'file', existing.filename);

		return { id: fileId, deleted: true as const };
	}

	/**
	 * Multipart upload stub: writes bytes under storage port, status ready.
	 * JSON metadata-only POST still uses `local://pending` (no bytes).
	 */
	async uploadLocalFileWithDb(
		db: TenantDb,
		tenantId: string,
		contactId: string,
		input: {
			filename: string;
			mimeType: string;
			appointmentId?: string | null;
			data: Buffer;
		},
		uploader: { userId: string; displayName: string }
	) {
		if (input.data.byteLength > MAX_UPLOAD_BYTES) {
			throw new BadRequestException({
				error: {
					code: 'validation_error',
					message: `File exceeds ${MAX_UPLOAD_BYTES} byte limit`
				}
			});
		}

		// AUDIT-F09-08: sniff before storage.put — covers local + S3 via RoutingFileStorage.
		const verifiedMime = await assertUploadMimeMatchesBytes(input.data, input.mimeType);

		const fileId = randomUUID();
		const storageKey = this.storage.buildKey(tenantId, contactId, fileId);
		await this.storage.put(storageKey, input.data, {
			contentType: verifiedMime,
			filename: input.filename
		});

		return this.createFileWithDb(
			db,
			tenantId,
			contactId,
			{
				filename: input.filename,
				mime_type: verifiedMime,
				size_bytes: input.data.byteLength,
				appointment_id: input.appointmentId ?? null
			},
			uploader,
			{ fileId, storageKey, sizeBytes: input.data.byteLength }
		);
	}

	async openFileDownload(tenantId: string, contactId: string, fileId: string) {
		return this.openFileStream(tenantId, contactId, fileId);
	}

	/**
	 * GAP-F09-24: allowlisted MIME → inline; legacy/non-allowlist rows → attachment
	 * (same as download). Streamed — never buffered in memory.
	 */
	async openFilePreview(tenantId: string, contactId: string, fileId: string): Promise<{
		filename: string;
		mimeType: string;
		sizeBytes: number;
		stream: NonNullable<Awaited<ReturnType<FileStoragePort['getStream']>>>;
		disposition: 'inline' | 'attachment';
	}> {
		const download = await this.openFileStream(tenantId, contactId, fileId);
		const disposition: 'inline' | 'attachment' = isInlineSafeContactFileMimeType(
			download.mimeType
		)
			? 'inline'
			: 'attachment';
		return { ...download, disposition };
	}

	private async openFileStream(tenantId: string, contactId: string, fileId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const contact = await this.findActiveRow(db, contactId);
			if (!contact) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Contact not found' }
				});
			}

			const [row] = await db
				.select()
				.from(files)
				.where(
					and(eq(files.id, fileId), eq(files.contactId, contactId), isNull(files.deletedAt))
				)
				.limit(1);

			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'File not found' }
				});
			}

			if (!(await this.storage.exists(row.storageKey))) {
				throw new NotFoundException({
					error: {
						code: 'not_found',
						message: 'File bytes not available (metadata-only or missing on disk)'
					}
				});
			}

			if (row.status === 'pending') {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'File upload not confirmed yet' }
				});
			}

			const stream = await this.storage.getStream(row.storageKey);
			if (!stream) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'File bytes not available' }
				});
			}

			return {
				filename: row.filename,
				mimeType: row.mimeType,
				sizeBytes: row.sizeBytes,
				stream
			};
		});
	}

	private async resolveAppointmentLink(
		db: TenantDb,
		tenantId: string,
		contactId: string,
		appointmentId: string | null
	) {
		if (!appointmentId) {
			return { appointmentId: null as string | null, appointmentLabel: null as string | null };
		}

		const [appt] = await db
			.select()
			.from(appointments)
			.where(
				and(
					eq(appointments.id, appointmentId),
					eq(appointments.contactId, contactId),
					isNull(appointments.deletedAt)
				)
			)
			.limit(1);
		if (!appt) {
			throw new BadRequestException({
				error: {
					code: 'validation_error',
					message: 'Appointment does not belong to this contact'
				}
			});
		}
		// Faz 7 denetim bulgusu (F-06): burada `toISOString().slice(0, 10)` kullanılıyordu —
		// `starts_at` bir timestamptz olduğu için Europe/Istanbul'da gece yarısına yakın
		// randevular etikette **bir gün geriye** kayıyordu (yerel 4 Ağustos 01:00 = UTC
		// 3 Ağustos 22:00). TIME-01'in kapatmayı amaçladığı hatanın aynısı; kalan tek
		// üretim yüzeyiydi, tenant timezone'una çevrildi.
		const timezone = await this.getTenantTimezone(db, tenantId);
		const datePart = toTenantDayKey(appt.startsAt, timezone);
		return {
			appointmentId,
			appointmentLabel: `${datePart} · ${appt.title ?? 'Randevu'}`
		};
	}

	/**
	 * AUDIT-01 (Faz 8): explicit tenant filter is required. The `tenants` table has no
	 * RLS by design (it's the tenant registry itself), so without a `where` clause the
	 * query returns whichever row Postgres scans first — non-deterministic across tenants.
	 * Opus denetimi §[CRITICAL]: "Patient file-label timezone leak" — fixing this also
	 * fixes the analogous bug in `reports.service.ts` (see reports-timezone spec).
	 */
	private async getTenantTimezone(db: TenantDb, tenantId: string): Promise<string> {
		const [row] = await db
			.select({ timezone: tenants.timezone })
			.from(tenants)
			.where(eq(tenants.id, tenantId))
			.limit(1);
		return row?.timezone ?? DEFAULT_TENANT_TIMEZONE;
	}

	async createWithDb(db: TenantDb, tenantId: string, input: ContactCreate) {
		const typeName = await this.requireContactTypeName(db, input.contact_type_id);
		const titleName = await this.resolveTitleName(db, input.title_id ?? null);
		const firstName = input.first_name.trim();
		const lastName = input.last_name?.trim() || null;
		const displayName = deriveDisplayName(firstName, lastName);
		const assignedUserId = await this.resolveAssignedUserId(
			db,
			tenantId,
			input.assigned_user_id ?? null
		);
		let row;
		try {
			[row] = await db
				.insert(contacts)
				.values({
					tenantId,
					contactTypeId: input.contact_type_id,
					contactTypeName: typeName,
					titleId: input.title_id ?? null,
					titleName,
					firstName,
					lastName,
					displayName,
					phone: input.phone ?? null,
					email: input.email ?? null,
					notes: input.notes ?? null,
					organizationId: input.organization_id ?? null,
					status: input.status ?? null,
					assignedUserId,
					source: input.source ?? null,
					medium: input.medium ?? null,
					campaign: input.campaign ?? null,
					referredByContactId: input.referred_by_contact_id ?? null,
					isInternal: input.is_internal ?? false
				})
				.returning();
		} catch (err) {
			if (isForeignKeyViolation(err) && assignedUserId) {
				throw new BadRequestException({
					error: {
						code: 'invalid_assignee',
						message: 'Assigned user must be a member of this organization'
					}
				});
			}
			throw err;
		}
		return toContact(row!);
	}

	async updateWithDb(db: TenantDb, id: string, input: ContactUpdate) {
		const existing = await this.findActiveRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}

		const contactTypeId = input.contact_type_id ?? existing.contactTypeId;
		const contactTypeName =
			input.contact_type_id !== undefined
				? await this.requireContactTypeName(db, contactTypeId)
				: existing.contactTypeName;

		const titleId = input.title_id !== undefined ? input.title_id : existing.titleId;
		const titleName =
			input.title_id !== undefined
				? await this.resolveTitleName(db, input.title_id)
				: existing.titleName;

		const firstName =
			input.first_name !== undefined
				? input.first_name.trim()
				: (existing.firstName ?? existing.displayName);
		const lastName =
			input.last_name !== undefined
				? input.last_name?.trim() || null
				: existing.lastName;
		const displayName = deriveDisplayName(firstName, lastName);
		const assignedUserId =
			input.assigned_user_id !== undefined
				? await this.resolveAssignedUserId(db, existing.tenantId, input.assigned_user_id)
				: existing.assignedUserId;

		let row;
		try {
			[row] = await db
				.update(contacts)
				.set({
					contactTypeId,
					contactTypeName,
					titleId,
					titleName,
					firstName,
					lastName,
					displayName,
					phone: input.phone !== undefined ? input.phone : existing.phone,
					email: input.email !== undefined ? input.email : existing.email,
					notes: input.notes !== undefined ? input.notes : existing.notes,
					organizationId:
						input.organization_id !== undefined
							? input.organization_id
							: existing.organizationId,
					status: input.status !== undefined ? input.status : existing.status,
					assignedUserId,
					source: input.source !== undefined ? input.source : existing.source,
					medium: input.medium !== undefined ? input.medium : existing.medium,
					campaign: input.campaign !== undefined ? input.campaign : existing.campaign,
					referredByContactId:
						input.referred_by_contact_id !== undefined
							? input.referred_by_contact_id
							: existing.referredByContactId,
					isInternal:
						input.is_internal !== undefined ? input.is_internal : existing.isInternal,
					updatedAt: new Date()
				})
				.where(eq(contacts.id, id))
				.returning();
		} catch (err) {
			if (isForeignKeyViolation(err) && input.assigned_user_id !== undefined) {
				throw new BadRequestException({
					error: {
						code: 'invalid_assignee',
						message: 'Assigned user must be a member of this organization'
					}
				});
			}
			throw err;
		}

		return toContact(row!);
	}

	async softDeleteWithDb(
		db: TenantDb,
		tenantId: string,
		id: string,
		actor: AuditActor
	) {
		const existing = await this.findActiveRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}

		await db
			.update(contacts)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(eq(contacts.id, id));

		await writeAuditLog(db, tenantId, actor, 'delete', 'contact', existing.displayName);

		return { id, deleted: true as const };
	}

	async duplicateGroups(tenantId: string, rowCap = DUPLICATE_SCAN_ROW_CAP) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db
				.select()
				.from(contacts)
				.where(isNull(contacts.deletedAt))
				.orderBy(asc(contacts.createdAt), asc(contacts.id))
				.limit(rowCap + 1);
			const truncated = rows.length > rowCap;
			const scanned = truncated ? rows.slice(0, rowCap) : rows;
			return {
				items: findContactDuplicateGroups(scanned.map(toContact)),
				truncated,
				scanned_count: scanned.length
			};
		});
	}

	async bulkSetType(tenantId: string, input: ContactsBulkType) {
		return this.tenantContext.withTenant(tenantId, ({ db }) =>
			this.bulkSetTypeWithDb(db, input)
		);
	}

	async bulkSetTypeWithDb(db: TenantDb, input: ContactsBulkType) {
		const typeName = await this.requireContactTypeName(db, input.contact_type_id);
		const updatedRows = await db
			.update(contacts)
			.set({
				contactTypeId: input.contact_type_id,
				contactTypeName: typeName,
				updatedAt: new Date()
			})
			.where(and(inArray(contacts.id, input.contact_ids), isNull(contacts.deletedAt)))
			.returning({ id: contacts.id });

		return { updated: updatedRows.length };
	}

	async mergeWithDb(
		db: TenantDb,
		tenantId: string,
		input: MergeRecords,
		actor: AuditActor
	) {
		const { keep_id, merge_ids } = input;
		if (merge_ids.includes(keep_id)) {
			throw new BadRequestException({
				error: { code: 'validation_error', message: 'keep_id cannot be in merge_ids' }
			});
		}

		const keep = await this.findActiveRow(db, keep_id);
		if (!keep) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}

		const sources = [];
		for (const id of merge_ids) {
			const row = await this.findActiveRow(db, id);
			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Contact not found' }
				});
			}
			sources.push(row);
		}

		let phone = keep.phone;
		let email = keep.email;
		let notes = keep.notes;
		let source = keep.source;
		let medium = keep.medium;
		let campaign = keep.campaign;
		let status = keep.status;
		let assignedUserId = keep.assignedUserId;
		let organizationId = keep.organizationId;
		let referredByContactId = keep.referredByContactId;
		let isInternal = keep.isInternal;
		let titleId = keep.titleId;
		let titleName = keep.titleName;
		for (const src of sources) {
			if (!phone && src.phone) phone = src.phone;
			if (!email && src.email) email = src.email;
			if (!notes && src.notes) notes = src.notes;
			if (!source && src.source) source = src.source;
			if (!medium && src.medium) medium = src.medium;
			if (!campaign && src.campaign) campaign = src.campaign;
			if (!status && src.status) status = src.status;
			if (!assignedUserId && src.assignedUserId) assignedUserId = src.assignedUserId;
			if (!organizationId && src.organizationId) organizationId = src.organizationId;
			if (!titleId && src.titleId) {
				titleId = src.titleId;
				titleName = src.titleName;
			}
			if (!referredByContactId && src.referredByContactId) {
				referredByContactId = src.referredByContactId;
			}
			if (!isInternal && src.isInternal) isInternal = true;
		}

		const [updatedKeep] = await db
			.update(contacts)
			.set({
				phone,
				email,
				notes,
				source,
				medium,
				campaign,
				status,
				assignedUserId,
				organizationId,
				referredByContactId,
				isInternal,
				titleId,
				titleName,
				updatedAt: new Date()
			})
			.where(eq(contacts.id, keep_id))
			.returning();

		const dropIds = merge_ids;
		const keepName = updatedKeep!.displayName;

		await db
			.update(transactions)
			.set({
				contactId: keep_id,
				contactDisplayName: keepName,
				contactLabel: keepName,
				updatedAt: new Date()
			})
			.where(and(inArray(transactions.contactId, dropIds), isNull(transactions.deletedAt)));

		await db
			.update(appointments)
			.set({
				contactId: keep_id,
				contactDisplayName: keepName,
				updatedAt: new Date()
			})
			.where(and(inArray(appointments.contactId, dropIds), isNull(appointments.deletedAt)));

		await db
			.update(appointments)
			.set({ clinicContactId: keep_id, clinicName: keepName, updatedAt: new Date() })
			.where(
				and(inArray(appointments.clinicContactId, dropIds), isNull(appointments.deletedAt))
			);

		await db
			.update(appointments)
			.set({ hotelContactId: keep_id, hotelName: keepName, updatedAt: new Date() })
			.where(
				and(inArray(appointments.hotelContactId, dropIds), isNull(appointments.deletedAt))
			);

		await db
			.update(appointments)
			.set({ transferContactId: keep_id, updatedAt: new Date() })
			.where(
				and(
					inArray(appointments.transferContactId, dropIds),
					isNull(appointments.deletedAt)
				)
			);

		await db.update(files).set({ contactId: keep_id }).where(inArray(files.contactId, dropIds));

		await db
			.update(caseNotes)
			.set({ contactId: keep_id })
			.where(inArray(caseNotes.contactId, dropIds));

		await db
			.update(contacts)
			.set({ referredByContactId: keep_id, updatedAt: new Date() })
			.where(
				and(inArray(contacts.referredByContactId, dropIds), isNull(contacts.deletedAt))
			);

		await db
			.update(contacts)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(inArray(contacts.id, dropIds));

		await writeAuditLog(db, tenantId, actor, 'update', 'contact', keepName);

		return toContact(updatedKeep!);
	}

	private async resolveAssignedUserId(
		db: TenantDb,
		tenantId: string,
		assignedUserId: string | null
	): Promise<string | null> {
		if (!assignedUserId) return null;

		const [byUserId] = await db
			.select({ userId: member.userId })
			.from(member)
			.where(and(eq(member.organizationId, tenantId), eq(member.userId, assignedUserId)))
			.limit(1);
		if (byUserId) return assignedUserId;

		// Panel once sent membership row id (`/v1/members` item id) instead of auth user id.
		const [byMemberId] = await db
			.select({ userId: member.userId })
			.from(member)
			.where(and(eq(member.organizationId, tenantId), eq(member.id, assignedUserId)))
			.limit(1);
		if (byMemberId) return byMemberId.userId;

		throw new BadRequestException({
			error: {
				code: 'invalid_assignee',
				message: 'Assigned user must be a member of this organization'
			}
		});
	}

	private async findActiveRow(db: TenantDb, id: string) {
		const [row] = await db
			.select()
			.from(contacts)
			.where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
			.limit(1);
		return row;
	}

	private async requireContactTypeName(db: TenantDb, contactTypeId: string) {
		const [type] = await db
			.select({ name: contactTypes.name })
			.from(contactTypes)
			.where(eq(contactTypes.id, contactTypeId))
			.limit(1);
		if (!type) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact type not found' }
			});
		}
		return type.name;
	}

	/**
	 * Ünvan opsiyonel — `null`/`undefined` girildiyse ünvansız kalır. Verilmişse
	 * kimliği tenant sözlüğünde bulunmalı (RLS zaten tenant'a kısıtlar).
	 */
	private async resolveTitleName(
		db: TenantDb,
		titleId: string | null | undefined
	): Promise<string | null> {
		if (!titleId) return null;
		const [title] = await db
			.select({ name: contactTitles.name })
			.from(contactTitles)
			.where(eq(contactTitles.id, titleId))
			.limit(1);
		if (!title) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact title not found' }
			});
		}
		return title.name;
	}
}
