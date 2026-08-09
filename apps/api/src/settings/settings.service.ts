import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException
} from '@nestjs/common';
import { asc, desc, eq, and, isNull } from 'drizzle-orm';
import type {
	AppointmentTypeCreate,
	ContactTypeCreate,
	CredentialUpsert,
	FinanceCategoryCreate,
	FinanceCategoryUpdate,
	TrustScoreSettings,
	WhatsappAiDisclosure,
	WhatsappAiDisclosureUpdate
} from '@verimaya/shared';
import {
	DEFAULT_APPOINTMENT_TYPE_NAMES,
	DEFAULT_CONTACT_TYPE_NAMES,
	DEFAULT_FINANCE_CATEGORY_SEEDS,
	defaultWhatsappAiDisclosure,
	trustScoreSettings,
	whatsappAiDisclosureSchema
} from '@verimaya/shared';
import {
	appointmentTypes,
	contactTypes,
	contacts,
	financeCategories,
	tenantCredentials,
	tenantSettings
} from '../db/schema';
import { toAppointmentType, toContactType, toFinanceCategory } from '../common/mappers';
import { type AuditActor, writeAuditLog } from '../common/audit-helper';
import { CREDENTIAL_KEY_VERSION, CryptoService } from '../common/crypto.service';
import { isUniqueViolation } from '../common/postgres-errors';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { defaultAppointmentTypeId } from './appointment-type-defaults';

const TRUST_SCORE_KEY = 'trust_score';
const WHATSAPP_AI_DISCLOSURE_KEY = 'whatsapp_ai_disclosure';
const AI_DISCLOSURE_AUDIT_LABEL = 'whatsapp_ai_disclosure';

/** Presence in tenant_settings ⇒ defaults were applied once; empty list must not re-seed. */
const APPOINTMENT_TYPES_SEEDED_KEY = 'appointment_types_defaults_seeded';
const CONTACT_TYPES_SEEDED_KEY = 'contact_types_defaults_seeded';
const FINANCE_CATEGORIES_SEEDED_KEY = 'finance_categories_defaults_seeded';

const APPOINTMENT_TYPES_NAME_UIDX = 'appointment_types_tenant_id_name_uidx';
const CONTACT_TYPES_NAME_UIDX = 'contact_types_tenant_id_name_uidx';

@Injectable()
export class SettingsService {
	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly crypto: CryptoService
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
		const [maxRow] = await db
			.select({ sortOrder: financeCategories.sortOrder })
			.from(financeCategories)
			.orderBy(desc(financeCategories.sortOrder))
			.limit(1);

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
}
