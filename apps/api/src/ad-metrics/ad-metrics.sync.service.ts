import { Injectable, Logger } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { adMetricsDaily, tenantCredentials } from '../db/schema';
import { TenantContextService } from '../tenant/tenant-context.service';
import { buildFixtureAdMetricsRows } from './ad-metrics.fixtures';

const AD_PROVIDERS = ['meta', 'google'] as const;

/**
 * Faz 5 ad metrics sync. Without OAuth credentials, upserts deterministic fixture rows into
 * `ad_metrics_daily` so `GET /v1/ad-metrics` returns data in local/dev. With credentials present,
 * logs and skips (real provider pull ships with OAuth adapters).
 */
@Injectable()
export class AdMetricsSyncService {
	private readonly logger = new Logger(AdMetricsSyncService.name);

	constructor(private readonly tenantContext: TenantContextService) {}

	async sync(tenantId: string): Promise<{ mode: 'fixture' | 'oauth_pending'; upserted: number }> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const creds = await db
				.select({ provider: tenantCredentials.provider })
				.from(tenantCredentials)
				.where(inArray(tenantCredentials.provider, [...AD_PROVIDERS]));

			if (creds.length > 0) {
				this.logger.debug(
					`ad_metrics.sync: tenant ${tenantId} has credentials (${creds.map((c) => c.provider).join(',')}); OAuth pull not implemented — skipping fixture write`
				);
				return { mode: 'oauth_pending' as const, upserted: 0 };
			}

			const rows = buildFixtureAdMetricsRows(tenantId);
			for (const row of rows) {
				await db
					.insert(adMetricsDaily)
					.values(row)
					.onConflictDoUpdate({
						target: [
							adMetricsDaily.tenantId,
							adMetricsDaily.provider,
							adMetricsDaily.date,
							adMetricsDaily.campaignId
						],
						set: {
							spendMinor: row.spendMinor,
							impressions: row.impressions,
							clicks: row.clicks
						}
					});
			}

			this.logger.log(
				`ad_metrics.sync: wrote ${rows.length} fixture rows for tenant ${tenantId} (no OAuth creds)`
			);
			return { mode: 'fixture' as const, upserted: rows.length };
		});
	}
}
