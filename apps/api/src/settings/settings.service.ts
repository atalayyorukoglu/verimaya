import { Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { CredentialUpsert } from '@verimaya/shared';
import {
	DEFAULT_CONTACT_TYPE_NAMES,
	DEFAULT_FINANCE_CATEGORY_SEEDS
} from '@verimaya/shared';
import { contactTypes, financeCategories, tenantCredentials } from '../db/schema';
import { toContactType, toFinanceCategory } from '../common/mappers';
import { CREDENTIAL_KEY_VERSION, CryptoService } from '../common/crypto.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { buildDefaultAppointmentTypes } from './appointment-type-defaults';

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
}
