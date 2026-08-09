import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, lt, type SQL } from 'drizzle-orm';
import type { AuditLogListQuery } from '@verimaya/shared';
import { tenantDayRange } from '@verimaya/shared';
import { auditLogs, tenants } from '../db/schema';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { toAuditLog } from '../common/mappers';
import { textSearchCondition } from '../common/search';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

@Injectable()
export class AuditLogsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string, params: AuditLogListQuery) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const cursorCond = createdAtCursorCondition(
				auditLogs.createdAt,
				auditLogs.id,
				params.cursor
			);

			const baseFilters: SQL[] = [];
			if (params.actor_id) baseFilters.push(eq(auditLogs.actorId, params.actor_id));
			if (params.action) baseFilters.push(eq(auditLogs.action, params.action));
			if (params.entity_type) baseFilters.push(eq(auditLogs.entityType, params.entity_type));

			if (params.created_from || params.created_to) {
				const timezone = await this.getTenantTimezone(db, tenantId);
				if (params.created_from) {
					const { start } = tenantDayRange(params.created_from, timezone);
					baseFilters.push(gte(auditLogs.createdAt, start));
				}
				if (params.created_to) {
					const { endExclusive } = tenantDayRange(params.created_to, timezone);
					baseFilters.push(lt(auditLogs.createdAt, endExclusive));
				}
			}

			const searchCond = textSearchCondition(params.q, [auditLogs.entityLabel]);
			if (searchCond) baseFilters.push(searchCond);

			const pageFilters = [...baseFilters];
			if (cursorCond) pageFilters.push(cursorCond);

			const rows = await db
				.select()
				.from(auditLogs)
				.where(pageFilters.length ? and(...pageFilters) : undefined)
				.orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
				.limit(params.limit + 1);

			const page = buildCursorPage(rows, params.limit);
			return {
				items: page.items.map(toAuditLog),
				next_cursor: page.next_cursor
			};
		});
	}

	private async getTenantTimezone(db: TenantDb, tenantId: string) {
		const [row] = await db
			.select({ timezone: tenants.timezone })
			.from(tenants)
			.where(eq(tenants.id, tenantId))
			.limit(1);
		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Tenant not found' }
			});
		}
		return row.timezone;
	}
}
