import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CryptoService } from '../common/crypto.service';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { SettingsService } from './settings.service';

process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('settings trust-score tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let settingsService: SettingsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`ts-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`ts-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`ts-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`ts-b-${tenantB.slice(0, 8)}`})
		`;

		const dbService = { client: db, sql } as unknown as DbService;
		settingsService = new SettingsService(
			new TenantContextService(dbService),
			new CryptoService()
		);

		await settingsService.saveTrustScore(tenantA, {
			checks: [{ id: 'consent_mode', score: 100 }]
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql`delete from tenant_settings where tenant_id in (${tenantA}, ${tenantB})`;
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant B cannot read Tenant A trust_score settings', async () => {
		const a = await settingsService.getTrustScore(tenantA);
		expect(a.checks).toHaveLength(1);
		expect(a.checks[0]?.id).toBe('consent_mode');
		expect(a.checks[0]?.score).toBe(100);

		const b = await settingsService.getTrustScore(tenantB);
		expect(b.checks).toEqual([]);
		expect(b.checks.some((c) => c.id === 'consent_mode' && c.score === 100)).toBe(false);
	});

	it('Tenant B own save stays isolated from A', async () => {
		await settingsService.saveTrustScore(tenantB, {
			checks: [{ id: 'emq_score', score: 50 }]
		});

		const a = await settingsService.getTrustScore(tenantA);
		expect(a.checks.map((c) => c.id)).toEqual(['consent_mode']);

		const b = await settingsService.getTrustScore(tenantB);
		expect(b.checks.map((c) => c.id)).toEqual(['emq_score']);
	});
});
