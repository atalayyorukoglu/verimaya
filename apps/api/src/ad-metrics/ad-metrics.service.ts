import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { AdMetricsListParams } from '@verimaya/shared';
import { adMetricsDaily } from '../db/schema';
import { toAdMetric } from '../common/mappers';
import { TenantContextService } from '../tenant/tenant-context.service';

@Injectable()
export class AdMetricsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string, params: AdMetricsListParams) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const conditions = [];
			if (params.from) {
				conditions.push(gte(adMetricsDaily.date, params.from));
			}
			if (params.to) {
				conditions.push(lte(adMetricsDaily.date, params.to));
			}
			if (params.provider) {
				conditions.push(eq(adMetricsDaily.provider, params.provider));
			}

			const rows = await db
				.select()
				.from(adMetricsDaily)
				.where(conditions.length ? and(...conditions) : undefined)
				.orderBy(desc(adMetricsDaily.date), desc(adMetricsDaily.campaignId));

			return { items: rows.map(toAdMetric) };
		});
	}
}
