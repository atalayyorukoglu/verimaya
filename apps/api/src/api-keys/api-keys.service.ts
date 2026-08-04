import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { ApiKeyCreateInput } from '@verimaya/shared';
import { apiKeys } from '../db/schema';
import { toApiKey } from '../common/mappers';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { generateApiKey } from './api-key-crypto';

@Injectable()
export class ApiKeysService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db
				.select()
				.from(apiKeys)
				.where(and(eq(apiKeys.tenantId, tenantId), isNull(apiKeys.revokedAt)))
				.orderBy(desc(apiKeys.createdAt));

			return { items: rows.map(toApiKey) };
		});
	}

	async create(tenantId: string, input: ApiKeyCreateInput) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) =>
			this.createWithDb(db, tenantId, input)
		);
	}

	async createWithDb(db: TenantDb, tenantId: string, input: ApiKeyCreateInput) {
		const material = generateApiKey();
		// AUDIT-03 (Faz 8): default 90-day expiry. Can be overridden by passing
		// `input.expires_at` from the controller (audit-found-1 follow-up UX:
		// admins pick expiry in issuance form). NULL = never expires — only used
		// for legacy compat, new keys should always have an expiry.
		const expiresAt = input.expires_at ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
		const [row] = await db
			.insert(apiKeys)
			.values({
				tenantId,
				name: input.name,
				keyPrefix: material.prefix,
				keyHash: material.hash,
				scopes: input.scopes,
				expiresAt
			})
			.returning();

		return {
			...toApiKey(row!),
			key: material.plaintext
		};
	}

	async revoke(tenantId: string, id: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) =>
			this.revokeWithDb(db, id)
		);
	}

	async revokeWithDb(db: TenantDb, id: string) {
		const row = await this.findActiveById(db, id);
		const [updated] = await db
			.update(apiKeys)
			.set({ revokedAt: new Date() })
			.where(eq(apiKeys.id, row.id))
			.returning();

		return toApiKey(updated!);
	}

	async findActiveById(db: TenantDb, id: string) {
		const [row] = await db
			.select()
			.from(apiKeys)
			.where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
			.limit(1);

		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'API key not found' }
			});
		}

		return row;
	}
}
