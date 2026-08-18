import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException
} from '@nestjs/common';
import { z } from 'zod';
import { asc, desc, eq, and, isNull } from 'drizzle-orm';
import type {
	AppointmentTypeCreate,
	ContactTypeCreate,
	ContactTypeUpdate,
	CredentialUpsert,
	FinanceCategoryCreate,
	FinanceCategoryUpdate,
	IncentiveDeadlineSettings,
	IncentiveDeadlineSettingsUpdate,
	KnowledgeSections,
	KnowledgeSettings,
	KnowledgeUpdate,
	OperationAlertSettings,
	OperationAlertSettingsUpdate,
	OrganizationCreate,
	OrganizationUpdate,
	SettingsReorder,
	TrustScoreSettings,
	WhatsappAiDisclosure,
	WhatsappAiDisclosureUpdate,
	WhatsappAiPrompt,
	WhatsappAiPromptUpdate
} from '@verimaya/shared';
import {
	DEFAULT_APPOINTMENT_TYPE_NAMES,
	DEFAULT_CONTACT_TYPE_NAMES,
	DEFAULT_FINANCE_CATEGORY_SEEDS,
	DEFAULT_INCENTIVE_DEADLINE_DAYS,
	INCENTIVE_DEADLINE_DAYS_KEY,
	OPERATION_ALERT_THRESHOLDS_KEY,
	DEFAULT_OPERATION_ALERT_THRESHOLDS,
	cloneOperationAlertThresholds,
	defaultIncentiveDeadlineSettings,
	defaultOperationAlertThresholds,
	defaultWhatsappAiDisclosure,
	defaultWhatsappAiPrompt,
	incentiveDeadlineSettingsSchema,
	operationAlertThresholdsEqual,
	parseOperationAlertThresholds,
	buildKnowledgeContext,
	emptyKnowledgeSections,
	findKnowledgePii,
	knowledgeSectionsSchema,
	trustScoreSettings,
	whatsappAiDisclosureSchema,
	whatsappAiPromptSchema
} from '@verimaya/shared';
import {
	appointmentTypes,
	contactTypes,
	contacts,
	financeCategories,
	organizations,
	tenantCredentials,
	knowledgeRevisions,
	tenantSettings
} from '../db/schema';
import { toAppointmentType, toContactType, toFinanceCategory, toOrganization } from '../common/mappers';
import { type AuditActor, writeAuditLog } from '../common/audit-helper';
import { CREDENTIAL_KEY_VERSION, CryptoService } from '../common/crypto.service';
import { isUniqueViolation } from '../common/postgres-errors';
import { OperationAlertsService } from '../operation-alerts/operation-alerts.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { defaultAppointmentTypeId } from './appointment-type-defaults';

const TRUST_SCORE_KEY = 'trust_score';
const WHATSAPP_AI_DISCLOSURE_KEY = 'whatsapp_ai_disclosure';
const AI_DISCLOSURE_AUDIT_LABEL = 'whatsapp_ai_disclosure';
const WHATSAPP_AI_PROMPT_KEY = 'whatsapp_ai_prompt';
const KNOWLEDGE_KEY = 'knowledge';
const KNOWLEDGE_AUDIT_LABEL = 'knowledge';
const OPERATION_ALERT_AUDIT_LABEL = 'operation_alert_thresholds';
const AI_PROMPT_AUDIT_LABEL = 'whatsapp_ai_prompt';

/** Presence in tenant_settings ⇒ defaults were applied once; empty list must not re-seed. */
const APPOINTMENT_TYPES_SEEDED_KEY = 'appointment_types_defaults_seeded';
const CONTACT_TYPES_SEEDED_KEY = 'contact_types_defaults_seeded';
const FINANCE_CATEGORIES_SEEDED_KEY = 'finance_categories_defaults_seeded';

const APPOINTMENT_TYPES_NAME_UIDX = 'appointment_types_tenant_id_name_uidx';
const CONTACT_TYPES_NAME_UIDX = 'contact_types_tenant_id_name_uidx';
const FINANCE_CATEGORIES_KIND_NAME_UIDX = 'finance_categories_tenant_kind_name_uidx';
const ORGANIZATIONS_NAME_UIDX = 'organizations_tenant_id_name_uidx';

@Injectable()
export class SettingsService {
	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly crypto: CryptoService,
		private readonly operationAlerts?: OperationAlertsService
	) {}

	async listFinanceCategories(tenantId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			let rows = await db
				.select()
				.from(financeCategories)
				.orderBy(asc(financeCategories.sortOrder), asc(financeCategories.name));

			if (rows.length === 0 && !(await this.hasDefaultsSeeded(db, FINANCE_CATEGORIES_SEEDED_KEY))) {
				await db
					.insert(financeCategories)
					.values(
						DEFAULT_FINANCE_CATEGORY_SEEDS.map((seed, i) => ({
							tenantId,
							kind: seed.kind,
							name: seed.name,
							sortOrder: i,
							subcategories: seed.subcategories
						}))
					)
					.onConflictDoNothing({
						target: [financeCategories.tenantId, financeCategories.kind, financeCategories.name]
					});
				await this.markDefaultsSeeded(db, tenantId, FINANCE_CATEGORIES_SEEDED_KEY);
				rows = await db
					.select()
					.from(financeCategories)
					.orderBy(asc(financeCategories.sortOrder), asc(financeCategories.name));
			}

			return { items: rows.map(toFinanceCategory) };
		});
	}

	async listContactTypes(tenantId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			let rows = await db
				.select()
				.from(contactTypes)
				.orderBy(asc(contactTypes.sortOrder), asc(contactTypes.name));

			if (rows.length === 0 && !(await this.hasDefaultsSeeded(db, CONTACT_TYPES_SEEDED_KEY))) {
				await db
					.insert(contactTypes)
					.values(
						DEFAULT_CONTACT_TYPE_NAMES.map((name, i) => ({
							tenantId,
							name,
							sortOrder: i
						}))
					)
					.onConflictDoNothing({
						target: [contactTypes.tenantId, contactTypes.name]
					});
				await this.markDefaultsSeeded(db, tenantId, CONTACT_TYPES_SEEDED_KEY);
				rows = await db
					.select()
					.from(contactTypes)
					.orderBy(asc(contactTypes.sortOrder), asc(contactTypes.name));
			}

			return { items: rows.map(toContactType) };
		});
	}

	async createFinanceCategory(tenantId: string, input: FinanceCategoryCreate) {
		return this.tenantContext.withTenant(tenantId, ({ db }) =>
			this.createFinanceCategoryWithDb(db, tenantId, input)
		);
	}

	/**
	 * IDEM-01 (Faz 4.1): plain insert, no dedup — a network retry without this would create a
	 * duplicate-named category. Split out so SettingsController can run it through
	 * IdempotencyService.run() (same tenantContext.withTenant transaction, caller-supplied `db`).
	 */
	async createFinanceCategoryWithDb(
		db: TenantDb,
		tenantId: string,
		input: FinanceCategoryCreate
	) {
		const siblings = await db
			.select({ kind: financeCategories.kind, name: financeCategories.name })
			.from(financeCategories);
		if (siblings.some((r) => r.kind === input.kind && r.name === input.name)) {
			throw this.duplicateTypeNameConflict('A finance category with this name already exists');
		}

		const [maxRow] = await db
			.select({ sortOrder: financeCategories.sortOrder })
			.from(financeCategories)
			.orderBy(desc(financeCategories.sortOrder))
			.limit(1);

		try {
			const [row] = await db
				.insert(financeCategories)
				.values({
					tenantId,
					kind: input.kind,
					name: input.name,
					sortOrder: (maxRow?.sortOrder ?? -1) + 1,
					subcategories: input.subcategories ?? []
				})
				.returning();

			return toFinanceCategory(row!);
		} catch (err) {
			if (isUniqueViolation(err, FINANCE_CATEGORIES_KIND_NAME_UIDX)) {
				throw this.duplicateTypeNameConflict('A finance category with this name already exists');
			}
			throw err;
		}
	}

	async updateFinanceCategory(tenantId: string, id: string, input: FinanceCategoryUpdate) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const existing = await this.findFinanceCategoryRow(db, id);

			const [row] = await db
				.update(financeCategories)
				.set({
					kind: input.kind ?? existing.kind,
					name: input.name ?? existing.name,
					sortOrder: input.sort_order ?? existing.sortOrder,
					subcategories: input.subcategories ?? existing.subcategories,
					updatedAt: new Date()
				})
				.where(eq(financeCategories.id, id))
				.returning();

			return toFinanceCategory(row!);
		});
	}

	async deleteFinanceCategory(tenantId: string, id: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await this.findFinanceCategoryRow(db, id);
			await db.delete(financeCategories).where(eq(financeCategories.id, id));
		});
	}

	/** GAP-27: absolute-set bulk reorder — foreign/other-tenant ids are skipped. */
	async reorderFinanceCategories(tenantId: string, input: SettingsReorder) {
		return this.tenantContext.withTenant(tenantId, ({ db }) =>
			this.reorderRowsWithDb(db, 'finance_categories', input)
		);
	}

	async createContactType(tenantId: string, input: ContactTypeCreate) {
		return this.tenantContext.withTenant(tenantId, ({ db }) =>
			this.createContactTypeWithDb(db, tenantId, input)
		);
	}

	/** IDEM-01 (Faz 4.1): see createFinanceCategoryWithDb — same split, same reason. */
	async createContactTypeWithDb(db: TenantDb, tenantId: string, input: ContactTypeCreate) {
		const name = input.name.trim();

		const existingRows = await db.select({ name: contactTypes.name }).from(contactTypes);
		if (existingRows.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
			throw this.duplicateTypeNameConflict('A contact type with this name already exists');
		}

		const [maxRow] = await db
			.select({ sortOrder: contactTypes.sortOrder })
			.from(contactTypes)
			.orderBy(desc(contactTypes.sortOrder))
			.limit(1);

		try {
			const [row] = await db
				.insert(contactTypes)
				.values({ tenantId, name, sortOrder: (maxRow?.sortOrder ?? -1) + 1 })
				.returning();

			return toContactType(row!);
		} catch (err) {
			if (isUniqueViolation(err, CONTACT_TYPES_NAME_UIDX)) {
				throw this.duplicateTypeNameConflict('A contact type with this name already exists');
			}
			throw err;
		}
	}

	async updateContactType(tenantId: string, id: string, input: ContactTypeUpdate) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [existing] = await db
				.select()
				.from(contactTypes)
				.where(eq(contactTypes.id, id))
				.limit(1);
			if (!existing) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Contact type not found' }
				});
			}

			const name = input.name.trim();
			const siblings = await db
				.select({ id: contactTypes.id, name: contactTypes.name })
				.from(contactTypes);
			if (
				siblings.some(
					(r) => r.id !== id && r.name.toLowerCase() === name.toLowerCase()
				)
			) {
				throw this.duplicateTypeNameConflict('A contact type with this name already exists');
			}

			try {
				const [row] = await db
					.update(contactTypes)
					.set({ name })
					.where(eq(contactTypes.id, id))
					.returning();

				// Keep denormalized contact_type_name in sync (FK stays; lists stay correct).
				if (name !== existing.name) {
					await db
						.update(contacts)
						.set({ contactTypeName: name, updatedAt: new Date() })
						.where(eq(contacts.contactTypeId, id));
				}

				return toContactType(row!);
			} catch (err) {
				if (isUniqueViolation(err, CONTACT_TYPES_NAME_UIDX)) {
					throw this.duplicateTypeNameConflict('A contact type with this name already exists');
				}
				throw err;
			}
		});
	}

	/** GAP-27: absolute-set bulk reorder — foreign/other-tenant ids are skipped. */
	async reorderContactTypes(tenantId: string, input: SettingsReorder) {
		return this.tenantContext.withTenant(tenantId, ({ db }) =>
			this.reorderRowsWithDb(db, 'contact_types', input)
		);
	}

	async deleteContactType(tenantId: string, id: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db.select().from(contactTypes).where(eq(contactTypes.id, id)).limit(1);
			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Contact type not found' }
				});
			}

			const [inUse] = await db
				.select({ id: contacts.id })
				.from(contacts)
				.where(and(eq(contacts.contactTypeId, id), isNull(contacts.deletedAt)))
				.limit(1);
			if (inUse) {
				throw new BadRequestException({
					error: {
						code: 'validation_error',
						message: 'Tür kullanımda — önce kişileri taşıyın'
					}
				});
			}

			await db.delete(contactTypes).where(eq(contactTypes.id, id));
		});
	}

	async listOrganizations(tenantId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db
				.select()
				.from(organizations)
				.where(isNull(organizations.deletedAt))
				.orderBy(asc(organizations.name));
			return { items: rows.map(toOrganization) };
		});
	}

	async createOrganization(tenantId: string, input: OrganizationCreate) {
		return this.tenantContext.withTenant(tenantId, ({ db }) =>
			this.createOrganizationWithDb(db, tenantId, input)
		);
	}

	/** IDEM-01 (Faz 4.1): see createFinanceCategoryWithDb — same split, same reason. */
	async createOrganizationWithDb(db: TenantDb, tenantId: string, input: OrganizationCreate) {
		const name = input.name.trim();

		// Soft-deleted rows must not block name reuse (partial unique WHERE deleted_at IS NULL).
		const existingRows = await db
			.select({ name: organizations.name })
			.from(organizations)
			.where(isNull(organizations.deletedAt));
		if (existingRows.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
			throw this.duplicateTypeNameConflict('An organization with this name already exists');
		}

		try {
			const [row] = await db
				.insert(organizations)
				.values({ tenantId, name })
				.returning();

			return toOrganization(row!);
		} catch (err) {
			if (isUniqueViolation(err, ORGANIZATIONS_NAME_UIDX)) {
				throw this.duplicateTypeNameConflict('An organization with this name already exists');
			}
			throw err;
		}
	}

	async updateOrganization(tenantId: string, id: string, input: OrganizationUpdate) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [existing] = await db
				.select()
				.from(organizations)
				.where(and(eq(organizations.id, id), isNull(organizations.deletedAt)))
				.limit(1);
			if (!existing) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Organization not found' }
				});
			}

			const name = input.name.trim();
			// Soft-deleted siblings must not block rename onto a recycled name.
			const siblings = await db
				.select({ id: organizations.id, name: organizations.name })
				.from(organizations)
				.where(isNull(organizations.deletedAt));
			if (
				siblings.some((r) => r.id !== id && r.name.toLowerCase() === name.toLowerCase())
			) {
				throw this.duplicateTypeNameConflict('An organization with this name already exists');
			}

			try {
				const [row] = await db
					.update(organizations)
					.set({ name, updatedAt: new Date() })
					.where(eq(organizations.id, id))
					.returning();

				return toOrganization(row!);
			} catch (err) {
				if (isUniqueViolation(err, ORGANIZATIONS_NAME_UIDX)) {
					throw this.duplicateTypeNameConflict('An organization with this name already exists');
				}
				throw err;
			}
		});
	}

	async deleteOrganization(tenantId: string, id: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db
				.select()
				.from(organizations)
				.where(and(eq(organizations.id, id), isNull(organizations.deletedAt)))
				.limit(1);
			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Organization not found' }
				});
			}

			const [inUse] = await db
				.select({ id: contacts.id })
				.from(contacts)
				.where(and(eq(contacts.organizationId, id), isNull(contacts.deletedAt)))
				.limit(1);
			if (inUse) {
				throw new BadRequestException({
					error: {
						code: 'validation_error',
						message: 'Firma kullanımda — önce kişileri taşıyın'
					}
				});
			}

			await db
				.update(organizations)
				.set({ deletedAt: new Date(), updatedAt: new Date() })
				.where(eq(organizations.id, id));
		});
	}

	async listAppointmentTypes(tenantId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			let rows = await db
				.select()
				.from(appointmentTypes)
				.orderBy(asc(appointmentTypes.sortOrder), asc(appointmentTypes.name));

			if (
				rows.length === 0 &&
				!(await this.hasDefaultsSeeded(db, APPOINTMENT_TYPES_SEEDED_KEY))
			) {
				await db
					.insert(appointmentTypes)
					.values(
						DEFAULT_APPOINTMENT_TYPE_NAMES.map((name, i) => ({
							id: defaultAppointmentTypeId(tenantId, name),
							tenantId,
							name,
							sortOrder: i
						}))
					)
					// Concurrent GETs collide on deterministic PK ids (not only name).
					.onConflictDoNothing();
				await this.markDefaultsSeeded(db, tenantId, APPOINTMENT_TYPES_SEEDED_KEY);
				rows = await db
					.select()
					.from(appointmentTypes)
					.orderBy(asc(appointmentTypes.sortOrder), asc(appointmentTypes.name));
			}

			return { items: rows.map(toAppointmentType) };
		});
	}

	async createAppointmentType(tenantId: string, input: AppointmentTypeCreate) {
		return this.tenantContext.withTenant(tenantId, ({ db }) =>
			this.createAppointmentTypeWithDb(db, tenantId, input)
		);
	}

	/** IDEM-01 (Faz 4.1): see createFinanceCategoryWithDb — same split, same reason. */
	async createAppointmentTypeWithDb(db: TenantDb, tenantId: string, input: AppointmentTypeCreate) {
		const name = input.name.trim();

		const existingRows = await db.select({ name: appointmentTypes.name }).from(appointmentTypes);
		if (existingRows.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
			throw this.duplicateTypeNameConflict('An appointment type with this name already exists');
		}

		const [maxRow] = await db
			.select({ sortOrder: appointmentTypes.sortOrder })
			.from(appointmentTypes)
			.orderBy(desc(appointmentTypes.sortOrder))
			.limit(1);

		try {
			const [row] = await db
				.insert(appointmentTypes)
				.values({ tenantId, name, sortOrder: (maxRow?.sortOrder ?? -1) + 1 })
				.returning();

			return toAppointmentType(row!);
		} catch (err) {
			if (isUniqueViolation(err, APPOINTMENT_TYPES_NAME_UIDX)) {
				throw this.duplicateTypeNameConflict('An appointment type with this name already exists');
			}
			throw err;
		}
	}

	/** GAP-27: absolute-set bulk reorder — foreign/other-tenant ids are skipped. */
	async reorderAppointmentTypes(tenantId: string, input: SettingsReorder) {
		return this.tenantContext.withTenant(tenantId, ({ db }) =>
			this.reorderRowsWithDb(db, 'appointment_types', input)
		);
	}

	async deleteAppointmentType(tenantId: string, id: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db
				.select()
				.from(appointmentTypes)
				.where(eq(appointmentTypes.id, id))
				.limit(1);
			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Appointment type not found' }
				});
			}

			// Free-text on appointments.appointment_type — no FK / in-use check.
			await db.delete(appointmentTypes).where(eq(appointmentTypes.id, id));
		});
	}

	async getCredentialStatus(tenantId: string, provider: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db
				.select({ keyVersion: tenantCredentials.keyVersion })
				.from(tenantCredentials)
				.where(eq(tenantCredentials.provider, provider))
				.limit(1);

			if (!row) {
				return { configured: false as const };
			}

			return { configured: true as const, key_version: row.keyVersion };
		});
	}

	async storeCredential(tenantId: string, provider: string, input: CredentialUpsert) {
		const ciphertext = this.crypto.encrypt(input.secret);

		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [existing] = await db
				.select({ id: tenantCredentials.id })
				.from(tenantCredentials)
				.where(eq(tenantCredentials.provider, provider))
				.limit(1);

			if (existing) {
				await db
					.update(tenantCredentials)
					.set({
						ciphertext,
						keyVersion: CREDENTIAL_KEY_VERSION
					})
					.where(eq(tenantCredentials.id, existing.id));
			} else {
				await db.insert(tenantCredentials).values({
					tenantId,
					provider,
					ciphertext,
					keyVersion: CREDENTIAL_KEY_VERSION
				});
			}

			return { configured: true as const, key_version: CREDENTIAL_KEY_VERSION };
		});
	}

	async loadCredentialSecret(tenantId: string, provider: string): Promise<string> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db
				.select({ ciphertext: tenantCredentials.ciphertext })
				.from(tenantCredentials)
				.where(eq(tenantCredentials.provider, provider))
				.limit(1);

			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Credential not configured' }
				});
			}

			return this.crypto.decrypt(row.ciphertext);
		});
	}

	async deleteCredential(tenantId: string, provider: string): Promise<void> {
		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db.delete(tenantCredentials).where(eq(tenantCredentials.provider, provider));
		});
	}

	async getTenantSetting(tenantId: string, key: string): Promise<unknown | null> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db
				.select({ value: tenantSettings.value })
				.from(tenantSettings)
				.where(eq(tenantSettings.key, key))
				.limit(1);
			return row?.value ?? null;
		});
	}

	async setTenantSetting(tenantId: string, key: string, value: unknown): Promise<void> {
		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db
				.insert(tenantSettings)
				.values({
					tenantId,
					key,
					value
				})
				.onConflictDoUpdate({
					target: [tenantSettings.tenantId, tenantSettings.key],
					set: {
						value,
						updatedAt: new Date()
					}
				});
		});
	}

	/**
	 * AI-01 — Bilgi bankası. `tenant_settings.knowledge` altında beş sabit bölüm.
	 * Kaydı engelleyen PII kontrolü YOK; yalnız uyarı döner (bkz. findKnowledgePii).
	 */
	async getKnowledge(tenantId: string): Promise<KnowledgeSettings> {
		const raw = await this.getTenantSetting(tenantId, KNOWLEDGE_KEY);
		if (raw == null) {
			return {
				sections: emptyKnowledgeSections(),
				is_default: true,
				updated_at: null,
				updated_by: null,
				pii_warnings: []
			};
		}
		const parsed = z
			.object({
				sections: knowledgeSectionsSchema,
				updated_at: z.string().nullable().optional(),
				updated_by: z.string().nullable().optional()
			})
			.safeParse(raw);
		if (!parsed.success) {
			return {
				sections: emptyKnowledgeSections(),
				is_default: true,
				updated_at: null,
				updated_by: null,
				pii_warnings: []
			};
		}
		const sections = parsed.data.sections;
		return {
			sections,
			is_default: buildKnowledgeContext(sections) == null,
			updated_at: parsed.data.updated_at ?? null,
			updated_by: parsed.data.updated_by ?? null,
			pii_warnings: findKnowledgePii(sections)
		};
	}

	async saveKnowledge(
		tenantId: string,
		input: KnowledgeUpdate,
		actor: AuditActor
	): Promise<KnowledgeSettings> {
		const now = new Date().toISOString();
		const value = {
			sections: input.sections,
			updated_at: now,
			updated_by: actor.actorDisplayName
		};

		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db
				.insert(tenantSettings)
				.values({ tenantId, key: KNOWLEDGE_KEY, value })
				.onConflictDoUpdate({
					target: [tenantSettings.tenantId, tenantSettings.key],
					set: { value, updatedAt: new Date() }
				});
			// AI-06: her kaydetmede sürüm bırakılır. "AI neden 2.400 dedi?" sorusunun
			// üç ay sonraki cevabı burada — o tarihte bilgi bankasında ne yazdığı görülür.
			// Aynı transaction içinde: ayar yazıldıysa sürüm de yazılmış olmalı.
			await db.insert(knowledgeRevisions).values({
				tenantId,
				sections: input.sections,
				changedBy: actor.actorDisplayName
			});
			await writeAuditLog(db, tenantId, actor, 'update', 'tenant', KNOWLEDGE_AUDIT_LABEL);
		});

		return {
			sections: input.sections,
			is_default: buildKnowledgeContext(input.sections) == null,
			updated_at: now,
			updated_by: actor.actorDisplayName,
			pii_warnings: findKnowledgePii(input.sections)
		};
	}

	/** AI-06: son sürümler, en yeni önce. Kayıtlar değiştirilemez (GRANT'te UPDATE yok). */
	async listKnowledgeRevisions(
		tenantId: string,
		limit = 20
	): Promise<Array<{ id: string; sections: KnowledgeSections; changed_by: string | null; created_at: string }>> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db
				.select()
				.from(knowledgeRevisions)
				.orderBy(desc(knowledgeRevisions.createdAt))
				.limit(limit);
			return rows.map((row) => {
				const parsed = knowledgeSectionsSchema.safeParse(row.sections);
				return {
					id: row.id,
					sections: parsed.success ? parsed.data : emptyKnowledgeSections(),
					changed_by: row.changedBy,
					created_at: row.createdAt.toISOString()
				};
			});
		});
	}

	async deleteKnowledge(tenantId: string, actor: AuditActor): Promise<KnowledgeSettings> {
		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db.delete(tenantSettings).where(eq(tenantSettings.key, KNOWLEDGE_KEY));
			await writeAuditLog(db, tenantId, actor, 'delete', 'tenant', KNOWLEDGE_AUDIT_LABEL);
		});
		return {
			sections: emptyKnowledgeSections(),
			is_default: true,
			updated_at: null,
			updated_by: null,
			pii_warnings: []
		};
	}

	/**
	 * AI-04b — per-kind hours + enabled. Stored under the existing
	 * `operation_alert_thresholds` key (legacy flat numbers still parse).
	 */
	async getOperationAlerts(tenantId: string): Promise<OperationAlertSettings> {
		const raw = await this.getTenantSetting(tenantId, OPERATION_ALERT_THRESHOLDS_KEY);
		if (raw == null) {
			return { thresholds: defaultOperationAlertThresholds(), is_default: true };
		}
		const thresholds = parseOperationAlertThresholds(raw);
		return {
			thresholds,
			is_default: operationAlertThresholdsEqual(thresholds, DEFAULT_OPERATION_ALERT_THRESHOLDS)
		};
	}

	async saveOperationAlerts(
		tenantId: string,
		input: OperationAlertSettingsUpdate,
		actor: AuditActor
	): Promise<OperationAlertSettings> {
		if (!this.operationAlerts) {
			throw new Error('OperationAlertsService is required to save operation alert settings');
		}
		const next = cloneOperationAlertThresholds(input.thresholds);

		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db
				.select({ value: tenantSettings.value })
				.from(tenantSettings)
				.where(eq(tenantSettings.key, OPERATION_ALERT_THRESHOLDS_KEY))
				.limit(1);
			const previous = row
				? parseOperationAlertThresholds(row.value)
				: defaultOperationAlertThresholds();

			await db
				.insert(tenantSettings)
				.values({ tenantId, key: OPERATION_ALERT_THRESHOLDS_KEY, value: next })
				.onConflictDoUpdate({
					target: [tenantSettings.tenantId, tenantSettings.key],
					set: { value: next, updatedAt: new Date() }
				});

			await this.operationAlerts!.applySettingsChangeWithDb(db, previous, next);
			await writeAuditLog(db, tenantId, actor, 'update', 'tenant', OPERATION_ALERT_AUDIT_LABEL);
		});

		return {
			thresholds: next,
			is_default: operationAlertThresholdsEqual(next, DEFAULT_OPERATION_ALERT_THRESHOLDS)
		};
	}

	async getTrustScore(tenantId: string): Promise<TrustScoreSettings> {
		const raw = await this.getTenantSetting(tenantId, TRUST_SCORE_KEY);
		if (raw == null) return { checks: [] };
		const parsed = trustScoreSettings.safeParse(raw);
		return parsed.success ? parsed.data : { checks: [] };
	}

	async saveTrustScore(tenantId: string, settings: TrustScoreSettings): Promise<TrustScoreSettings> {
		await this.setTenantSetting(tenantId, TRUST_SCORE_KEY, settings);
		return settings;
	}

	async getAiDisclosure(tenantId: string): Promise<WhatsappAiDisclosure> {
		const raw = await this.getTenantSetting(tenantId, WHATSAPP_AI_DISCLOSURE_KEY);
		if (raw == null) return defaultWhatsappAiDisclosure();
		const parsed = whatsappAiDisclosureSchema.safeParse(raw);
		return parsed.success ? parsed.data : defaultWhatsappAiDisclosure();
	}

	async saveAiDisclosure(
		tenantId: string,
		input: WhatsappAiDisclosureUpdate,
		actor: AuditActor
	): Promise<WhatsappAiDisclosure> {
		const value: WhatsappAiDisclosure = {
			enabled: input.enabled,
			text: input.text,
			updated_by: actor.actorDisplayName,
			updated_at: new Date().toISOString()
		};

		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db
				.insert(tenantSettings)
				.values({
					tenantId,
					key: WHATSAPP_AI_DISCLOSURE_KEY,
					value
				})
				.onConflictDoUpdate({
					target: [tenantSettings.tenantId, tenantSettings.key],
					set: {
						value,
						updatedAt: new Date()
					}
				});

			await writeAuditLog(
				db,
				tenantId,
				actor,
				'update',
				'tenant',
				AI_DISCLOSURE_AUDIT_LABEL
			);
		});

		return value;
	}

	async getAiPrompt(tenantId: string): Promise<WhatsappAiPrompt> {
		const raw = await this.getTenantSetting(tenantId, WHATSAPP_AI_PROMPT_KEY);
		if (raw == null) return defaultWhatsappAiPrompt();
		const parsed = whatsappAiPromptSchema.safeParse(raw);
		return parsed.success ? parsed.data : defaultWhatsappAiPrompt();
	}

	async saveAiPrompt(
		tenantId: string,
		input: WhatsappAiPromptUpdate,
		actor: AuditActor
	): Promise<WhatsappAiPrompt> {
		const value: WhatsappAiPrompt = {
			text: input.text,
			is_default: false,
			updated_by: actor.actorDisplayName,
			updated_at: new Date().toISOString()
		};

		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db
				.insert(tenantSettings)
				.values({
					tenantId,
					key: WHATSAPP_AI_PROMPT_KEY,
					value
				})
				.onConflictDoUpdate({
					target: [tenantSettings.tenantId, tenantSettings.key],
					set: {
						value,
						updatedAt: new Date()
					}
				});

			await writeAuditLog(db, tenantId, actor, 'update', 'tenant', AI_PROMPT_AUDIT_LABEL);
		});

		return value;
	}

	async resetAiPrompt(tenantId: string, actor: AuditActor): Promise<WhatsappAiPrompt> {
		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db
				.delete(tenantSettings)
				.where(
					and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, WHATSAPP_AI_PROMPT_KEY))
				);

			await writeAuditLog(db, tenantId, actor, 'delete', 'tenant', AI_PROMPT_AUDIT_LABEL);
		});

		return defaultWhatsappAiPrompt();
	}

	async getIncentiveDeadline(tenantId: string): Promise<IncentiveDeadlineSettings> {
		const raw = await this.getTenantSetting(tenantId, INCENTIVE_DEADLINE_DAYS_KEY);
		if (raw == null) return defaultIncentiveDeadlineSettings();
		if (typeof raw === 'number' && Number.isInteger(raw)) {
			return {
				days: raw,
				is_default: false,
				updated_by: null,
				updated_at: null
			};
		}
		const parsed = incentiveDeadlineSettingsSchema.safeParse(raw);
		return parsed.success ? parsed.data : defaultIncentiveDeadlineSettings();
	}

	/** Days used when computing `deadline_at` on create — default when unset. */
	async getIncentiveDeadlineDays(tenantId: string): Promise<number> {
		const settings = await this.getIncentiveDeadline(tenantId);
		return settings.days > 0 ? settings.days : DEFAULT_INCENTIVE_DEADLINE_DAYS;
	}

	async saveIncentiveDeadline(
		tenantId: string,
		input: IncentiveDeadlineSettingsUpdate,
		actor: AuditActor
	): Promise<IncentiveDeadlineSettings> {
		const value: IncentiveDeadlineSettings = {
			days: input.days,
			is_default: false,
			updated_by: actor.actorDisplayName,
			updated_at: new Date().toISOString()
		};

		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db
				.insert(tenantSettings)
				.values({
					tenantId,
					key: INCENTIVE_DEADLINE_DAYS_KEY,
					value
				})
				.onConflictDoUpdate({
					target: [tenantSettings.tenantId, tenantSettings.key],
					set: {
						value,
						updatedAt: new Date()
					}
				});

			await writeAuditLog(db, tenantId, actor, 'update', 'tenant', INCENTIVE_DEADLINE_DAYS_KEY);
		});

		return value;
	}

	async resetIncentiveDeadline(
		tenantId: string,
		actor: AuditActor
	): Promise<IncentiveDeadlineSettings> {
		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db
				.delete(tenantSettings)
				.where(
					and(
						eq(tenantSettings.tenantId, tenantId),
						eq(tenantSettings.key, INCENTIVE_DEADLINE_DAYS_KEY)
					)
				);

			await writeAuditLog(db, tenantId, actor, 'delete', 'tenant', INCENTIVE_DEADLINE_DAYS_KEY);
		});

		return defaultIncentiveDeadlineSettings();
	}

	private duplicateTypeNameConflict(message: string): ConflictException {
		return new ConflictException({
			error: {
				code: 'duplicate_type_name',
				message
			}
		});
	}

	private async hasDefaultsSeeded(db: TenantDb, key: string): Promise<boolean> {
		const [row] = await db
			.select({ key: tenantSettings.key })
			.from(tenantSettings)
			.where(eq(tenantSettings.key, key))
			.limit(1);
		return row != null;
	}

	private async markDefaultsSeeded(db: TenantDb, tenantId: string, key: string): Promise<void> {
		await db
			.insert(tenantSettings)
			.values({
				tenantId,
				key,
				value: true
			})
			.onConflictDoNothing({
				target: [tenantSettings.tenantId, tenantSettings.key]
			});
	}

	private async findFinanceCategoryRow(db: TenantDb, id: string) {
		const [row] = await db
			.select()
			.from(financeCategories)
			.where(eq(financeCategories.id, id))
			.limit(1);
		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Finance category not found' }
			});
		}
		return row;
	}

	/**
	 * GAP-27: one transaction (via withTenant) updates every owned row; RLS + WHERE id
	 * silently skips foreign tenants / unknown ids — `updated` is the real count.
	 */
	private async reorderRowsWithDb(
		db: TenantDb,
		kind: 'contact_types' | 'appointment_types' | 'finance_categories',
		input: SettingsReorder
	): Promise<{ updated: number }> {
		let updated = 0;
		for (const item of input.items) {
			if (kind === 'finance_categories') {
				const rows = await db
					.update(financeCategories)
					.set({ sortOrder: item.sort_order, updatedAt: new Date() })
					.where(eq(financeCategories.id, item.id))
					.returning({ id: financeCategories.id });
				updated += rows.length;
			} else if (kind === 'contact_types') {
				const rows = await db
					.update(contactTypes)
					.set({ sortOrder: item.sort_order })
					.where(eq(contactTypes.id, item.id))
					.returning({ id: contactTypes.id });
				updated += rows.length;
			} else {
				const rows = await db
					.update(appointmentTypes)
					.set({ sortOrder: item.sort_order })
					.where(eq(appointmentTypes.id, item.id))
					.returning({ id: appointmentTypes.id });
				updated += rows.length;
			}
		}
		return { updated };
	}
}
