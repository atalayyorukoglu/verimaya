import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CryptoService } from '../common/crypto.service';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { SettingsService } from './settings.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('settings ai-prompt tenant isolation (G-26)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let settingsService: SettingsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`aip-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`aip-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`aip-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`aip-b-${tenantB.slice(0, 8)}`})
		`;

		const dbService = { client: db, sql } as unknown as DbService;
		settingsService = new SettingsService(
			new TenantContextService(dbService),
			new CryptoService()
		);

		await settingsService.saveAiPrompt(
			tenantA,
			{ text: 'Tenant A prefers GBP amounts' },
			{ actorId: null, actorDisplayName: 'Actor A' }
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant B cannot read Tenant A ai-prompt', async () => {
		const a = await settingsService.getAiPrompt(tenantA);
		expect(a.is_default).toBe(false);
		expect(a.text).toBe('Tenant A prefers GBP amounts');

		const b = await settingsService.getAiPrompt(tenantB);
		expect(b.is_default).toBe(true);
		expect(b.text).toBe('');
		expect(b.text).not.toBe('Tenant A prefers GBP amounts');
	});

	it('Tenant B save stays isolated and writes audit_logs', async () => {
		await settingsService.saveAiPrompt(
			tenantB,
			{ text: 'Tenant B note about hotel labels' },
			{ actorId: null, actorDisplayName: 'Actor B' }
		);

		const a = await settingsService.getAiPrompt(tenantA);
		expect(a.text).toBe('Tenant A prefers GBP amounts');

		const b = await settingsService.getAiPrompt(tenantB);
		expect(b.is_default).toBe(false);
		expect(b.text).toBe('Tenant B note about hotel labels');
		expect(b.updated_by).toBe('Actor B');
		expect(b.updated_at).toBeTruthy();

		const { sql } = getDb(databaseUrl);
		const logsA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select entity_label, actor_display_name
				from audit_logs
				where tenant_id = ${tenantA} and entity_label = 'whatsapp_ai_prompt'
			`;
		});
		const logsB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`
				select entity_label, actor_display_name
				from audit_logs
				where tenant_id = ${tenantB} and entity_label = 'whatsapp_ai_prompt'
			`;
		});

		expect(logsA.length).toBeGreaterThanOrEqual(1);
		expect(logsA.every((r) => r.actor_display_name === 'Actor A')).toBe(true);
		expect(logsB.length).toBe(1);
		expect(logsB[0]?.actor_display_name).toBe('Actor B');
	});

	it('DELETE resets to default and Tenant A remains custom', async () => {
		const reset = await settingsService.resetAiPrompt(tenantB, {
			actorId: null,
			actorDisplayName: 'Actor B'
		});
		expect(reset.is_default).toBe(true);
		expect(reset.text).toBe('');

		const b = await settingsService.getAiPrompt(tenantB);
		expect(b.is_default).toBe(true);

		const a = await settingsService.getAiPrompt(tenantA);
		expect(a.is_default).toBe(false);
		expect(a.text).toBe('Tenant A prefers GBP amounts');
	});
});
