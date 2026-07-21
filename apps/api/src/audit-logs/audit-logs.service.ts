import { Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { auditLogs } from '../db/schema';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { toAuditLog } from '../common/mappers';
import { TenantContextService } from '../tenant/tenant-context.service';

@Injectable()
export class AuditLogsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string, params: { cursor?: string; limit: number }) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const cursorCond = createdAtCursorCondition(
				auditLogs.createdAt,
				auditLogs.id,
				params.cursor
			);
			const rows = await db
				.select()
				.from(auditLogs)
				.where(cursorCond)
				.orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
				.limit(params.limit + 1);

			const page = buildCursorPage(rows, params.limit);
			return {
				items: page.items.map(toAuditLog),
				next_cursor: page.next_cursor
			};
		});
	}
}
