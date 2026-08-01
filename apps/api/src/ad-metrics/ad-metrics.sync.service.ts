import { Injectable, Logger } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { adMetricsDaily, tenantCredentials } from '../db/schema';
import { AdsAdapterRegistry } from '../integrations/ads/ads-adapter.registry';
import { SettingsService } from '../settings/settings.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { buildFixtureAdMetricsRows } from './ad-metrics.fixtures';

const AD_PROVIDERS = ['meta', 'google'] as const;

/**
 * Reports "all time" only sums what is in `ad_metrics_daily`.
 * Manual sync must pull a long window so totals match Ads UI history.
 * (~10 years — enough for typical health-tourism ad accounts.)
 */
const AD_METRICS_SYNC_LOOKBACK_DAYS = 3650;

function sinceDaysAgo(days: number): string {
	const d = new Date();
	d.setUTCHours(0, 0, 0, 0);
	d.setUTCDate(d.getUTCDate() - days);
	return d.toISOString().slice(0, 10);
}

/**
 * Ad metrics sync. Without OAuth credentials, upserts deterministic fixture rows.
 * With credentials, pulls via AdsProviderAdapter (stub until RM-4b/c) and upserts.
 */
@Injectable()
export class AdMetricsSyncService {
	private readonly logger = new Logger(AdMetricsSyncService.name);

	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly settings: SettingsService,
		private readonly adsRegistry: AdsAdapterRegistry
	) {}

	async sync(tenantId: string): Promise<{ mode: 'fixture' | 'oauth'; upserted: number }> {
		const providers = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const creds = await db
				.select({ provider: tenantCredentials.provider })
				.from(tenantCredentials)
				.where(inArray(tenantCredentials.provider, [...AD_PROVIDERS]));
			return creds.map((c) => c.provider);
		});

		if (providers.length === 0) {
			return this.syncFixture(tenantId);
		}

		const since = sinceDaysAgo(AD_METRICS_SYNC_LOOKBACK_DAYS);
		let upserted = 0;

		for (const providerRaw of providers) {
			const provider = this.adsRegistry.parseProvider(providerRaw);
			const secret = await this.settings.loadCredentialSecret(tenantId, provider);
			const rows = await this.adsRegistry
				.get(provider)
				.pullDailyMetrics({ secret, since });

			await this.tenantContext.withTenant(tenantId, async ({ db }) => {
				for (const row of rows) {
					await db
						.insert(adMetricsDaily)
						.values({
							tenantId,
							provider: row.provider,
							date: row.date,
							campaignId: row.campaignId,
							spendMinor: row.spendMinor,
							impressions: row.impressions,
							clicks: row.clicks
						})
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
			});

			upserted += rows.length;
			this.logger.log(
				`ad_metrics.sync: oauth pull upserted ${rows.length} rows for tenant ${tenantId} provider ${provider}`
			);
		}

		return { mode: 'oauth', upserted };
	}

	private async syncFixture(
		tenantId: string
	): Promise<{ mode: 'fixture'; upserted: number }> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
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
