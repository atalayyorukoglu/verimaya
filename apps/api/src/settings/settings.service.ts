import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
import type {
	ContactTypeCreate,
	CredentialUpsert,
	FinanceCategoryCreate,
	FinanceCategoryUpdate,
	TrustScoreSettings
} from '@verimaya/shared';
import {
	DEFAULT_CONTACT_TYPE_NAMES,
	DEFAULT_FINANCE_CATEGORY_SEEDS,
	trustScoreSettings
} from '@verimaya/shared';
import {
	contactTypes,
	contacts,
	financeCategories,
	tenantCredentials,
	tenantSettings
} from '../db/schema';
import { toContactType, toFinanceCategory } from '../common/mappers';
import { CREDENTIAL_KEY_VERSION, CryptoService } from '../common/crypto.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { buildDefaultAppointmentTypes } from './appointment-type-defaults';

const TRUST_SCORE_KEY = 'trust_score';

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

			if (rows.length === 0) {
				await db.insert(financeCategories).values(
					DEFAULT_FINANCE_CATEGORY_SEEDS.map((seed, i) => ({
						tenantId,
						kind: seed.kind,
						name: seed.name,
						sortOrder: i,
						subcategories: seed.subcategories
					}))
				);
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

			if (rows.length === 0) {
				await db.insert(contactTypes).values(
					DEFAULT_CONTACT_TYPE_NAMES.map((name, i) => ({
						tenantId,
						name,
						sortOrder: i
					}))
				);
				rows = await db
					.select()
					.from(contactTypes)
					.orderBy(asc(contactTypes.sortOrder), asc(contactTypes.name));
			}

			return { items: rows.map(toContactType) };
		});
	}

	async createFinanceCategory(tenantId: string, input: FinanceCategoryCreate) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
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
		});
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
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const name = input.name.trim();

			const existingRows = await db.select({ name: contactTypes.name }).from(contactTypes);
			if (existingRows.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
				throw new BadRequestException({
					error: { code: 'validation_error', message: 'Bu tür zaten var' }
				});
			}

			const [maxRow] = await db
				.select({ sortOrder: contactTypes.sortOrder })
				.from(contactTypes)
				.orderBy(desc(contactTypes.sortOrder))
				.limit(1);

			const [row] = await db
				.insert(contactTypes)
				.values({ tenantId, name, sortOrder: (maxRow?.sortOrder ?? -1) + 1 })
				.returning();

			return toContactType(row!);
		});
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
				.where(eq(contacts.contactTypeId, id))
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

	listAppointmentTypes(tenantId: string) {
		return { items: buildDefaultAppointmentTypes(tenantId) };
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
