import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { TenantUpdate } from '@verimaya/shared';
import { tenants, transactions } from '../db/schema';
import { toTenant } from '../common/mappers';
import { writeAuditLog, type AuditActor } from '../common/audit-helper';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

@Injectable()
export class TenantsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async get(tenantId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const row = await this.findRow(db, tenantId);
			const locked = await this.hasTransactions(db);
			return toTenant(row, locked);
		});
	}

	async update(tenantId: string, input: TenantUpdate, actor: AuditActor) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const existing = await this.findRow(db, tenantId);

			if (
				input.base_currency != null &&
				input.base_currency !== existing.baseCurrency &&
				(await this.hasTransactions(db))
			) {
				throw new ConflictException({
					error: {
						code: 'base_currency_locked',
						message:
							'Base currency is locked after the first transaction; it cannot be changed'
					}
				});
			}

			const [row] = await db
				.update(tenants)
				.set({
					name: input.name ?? existing.name,
					baseCurrency: input.base_currency ?? existing.baseCurrency,
					patientsSectionLabel: input.patients_section_label ?? existing.patientsSectionLabel,
					timezone: input.timezone ?? existing.timezone
				})
				.where(eq(tenants.id, tenantId))
				.returning();

			await writeAuditLog(db, tenantId, actor, 'update', 'tenant', row!.name);

			const locked = await this.hasTransactions(db);
			return toTenant(row!, locked);
		});
	}

	private async hasTransactions(db: TenantDb): Promise<boolean> {
		const [row] = await db.select({ n: sql<number>`1` }).from(transactions).limit(1);
		return row != null;
	}

	private async findRow(db: TenantDb, tenantId: string) {
		const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Tenant not found' }
			});
		}
		return row;
	}
}
