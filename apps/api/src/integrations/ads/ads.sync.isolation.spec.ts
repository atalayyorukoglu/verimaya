import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIXTURE_META_CAMPAIGN_ID } from '../../ad-metrics/ad-metrics.fixtures';
import { AdMetricsSyncService } from '../../ad-metrics/ad-metrics.sync.service';
import { CryptoService } from '../../common/crypto.service';
import { closeDb, getDb } from '../../db/client';
import { DbService } from '../../db/db.service';
import { SettingsService } from '../../settings/settings.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { AdsAdapterRegistry } from './ads-adapter.registry';
import { STUB_META_CAMPAIGN_ID, StubAdsAdapter } from './ads.stub-adapter';
import { purgeTenantFixtures } from '../../test/purge-tenant-fixtures';

process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('Ads OAuth stub sync tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let syncService: AdMetricsSyncService;
	let settingsService: SettingsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`ads-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`ads-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`ads-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`ads-b-${tenantB.slice(0, 8)}`})
		`;

		const { db } = getDb(databaseUrl);
		const dbService = { client: db, sql } as unknown as DbService;
		const tenantContext = new TenantContextService(dbService);
		const crypto = new CryptoService();
		settingsService = new SettingsService(tenantContext, crypto);
		const registry = new AdsAdapterRegistry();
		// Isolation asserts stub campaign ids — keep Stub for meta (Meta HTTP covered in unit specs).
		registry.replace('meta', new StubAdsAdapter('meta'));
		syncService = new AdMetricsSyncService(tenantContext, settingsService, registry);

		await settingsService.storeCredential(tenantA, 'meta', { secret: 'stub-meta-token' });
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('A with meta creds pulls stub oauth rows; B without creds gets fixture; A rows stay isolated', async () => {
		const syncA = await syncService.sync(tenantA);
		expect(syncA.mode).toBe('oauth');
		expect(syncA.upserted).toBe(2);

		const syncB = await syncService.sync(tenantB);
		expect(syncB.mode).toBe('fixture');
		expect(syncB.upserted).toBe(3);

		const { sql } = getDb(databaseUrl);
		const rowsA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select campaign_id, provider from ad_metrics_daily
				where tenant_id = ${tenantA}
				order by provider, campaign_id, date
			`;
		});
		expect(rowsA.length).toBe(2);
		expect(rowsA.every((r) => r.campaign_id === STUB_META_CAMPAIGN_ID)).toBe(true);
		expect(rowsA.every((r) => r.provider === 'meta')).toBe(true);

		const rowsB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`
				select campaign_id from ad_metrics_daily
				where tenant_id = ${tenantB}
			`;
		});
		expect(rowsB.length).toBe(3);
		expect(rowsB.some((r) => r.campaign_id === FIXTURE_META_CAMPAIGN_ID)).toBe(true);
		expect(rowsB.some((r) => r.campaign_id === STUB_META_CAMPAIGN_ID)).toBe(false);

		const leak = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`select id from ad_metrics_daily where tenant_id = ${tenantA}`;
		});
		expect(leak).toHaveLength(0);
	});
});
