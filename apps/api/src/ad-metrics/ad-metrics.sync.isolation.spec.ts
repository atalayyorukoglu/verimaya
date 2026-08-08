import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CryptoService } from '../common/crypto.service';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { AdsAdapterRegistry } from '../integrations/ads/ads-adapter.registry';
import { SettingsService } from '../settings/settings.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { FIXTURE_META_CAMPAIGN_ID } from './ad-metrics.fixtures';
import { AdMetricsSyncService } from './ad-metrics.sync.service';

process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('AdMetricsSyncService tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let syncService: AdMetricsSyncService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`adm-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`adm-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`adm-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`adm-b-${tenantB.slice(0, 8)}`})
		`;

		const { db } = getDb(databaseUrl);
		const dbService = { client: db, sql } as unknown as DbService;
		const tenantContext = new TenantContextService(dbService);
		syncService = new AdMetricsSyncService(
			tenantContext,
			new SettingsService(tenantContext, new CryptoService()),
			new AdsAdapterRegistry()
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql`delete from ad_metrics_daily where tenant_id in (${tenantA}, ${tenantB})`;
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('writes fixture rows for A; B cannot read them; upsert is idempotent', async () => {
		const first = await syncService.sync(tenantA);
		expect(first.mode).toBe('fixture');
		expect(first.upserted).toBe(3);

		const second = await syncService.sync(tenantA);
		expect(second.mode).toBe('fixture');
		expect(second.upserted).toBe(3);

		const { sql } = getDb(databaseUrl);
		const rowsA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select campaign_id, provider from ad_metrics_daily
				where tenant_id = ${tenantA}
				order by provider, campaign_id, date
			`;
		});
		expect(rowsA.length).toBe(3);
		expect(rowsA.some((r) => r.campaign_id === FIXTURE_META_CAMPAIGN_ID)).toBe(true);

		const rowsB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`select id from ad_metrics_daily where tenant_id = ${tenantA}`;
		});
		expect(rowsB).toHaveLength(0);
	});

	/**
	 * Ads providers restate recent-day cost, so a re-sync can move spend_minor
	 * under a spend_base converted from the old figure. The stale snapshot must
	 * not survive: reports would show it as current, and the non-force backfill
	 * only revisits rows where spend_base is null (OPS-02c).
	 */
	it('clears the FX snapshot when a re-sync restates spend, keeps it when spend is unchanged', async () => {
		await syncService.sync(tenantA);
		const { sql } = getDb(databaseUrl);

		const [restated, untouched] = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select id, spend_minor from ad_metrics_daily
				where tenant_id = ${tenantA}
				order by provider, campaign_id, date
				limit 2
			`;
		});

		// Both rows get a backfill-shaped snapshot; only the first has its spend moved.
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`
				update ad_metrics_daily
				set spend_minor = ${Number(restated.spend_minor) + 12345},
					spend_base = 999, base_currency = 'GBP',
					fx_rate = 0.5, fx_dated = '2026-01-01'
				where id = ${restated.id}
			`;
			await tx`
				update ad_metrics_daily
				set spend_base = 777, base_currency = 'GBP',
					fx_rate = 0.25, fx_dated = '2026-01-02'
				where id = ${untouched.id}
			`;
		});

		await syncService.sync(tenantA);

		const after = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select id, spend_minor, spend_base, base_currency, fx_rate, fx_dated
				from ad_metrics_daily
				where id in (${restated.id}, ${untouched.id})
			`;
		});
		const restatedAfter = after.find((r) => r.id === restated.id);
		const untouchedAfter = after.find((r) => r.id === untouched.id);

		// Sync put the real figure back and dropped the snapshot converted from the old one.
		expect(Number(restatedAfter?.spend_minor)).toBe(Number(restated.spend_minor));
		expect(restatedAfter?.spend_base).toBeNull();
		expect(restatedAfter?.base_currency).toBeNull();
		expect(restatedAfter?.fx_rate).toBeNull();
		expect(restatedAfter?.fx_dated).toBeNull();

		// A row whose money did not move keeps its snapshot — no needless re-backfill.
		expect(Number(untouchedAfter?.spend_base)).toBe(777);
		expect(untouchedAfter?.base_currency).toBe('GBP');
	});
});
