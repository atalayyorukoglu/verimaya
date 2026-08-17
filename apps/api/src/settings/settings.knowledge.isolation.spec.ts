import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CryptoService } from '../common/crypto.service';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { SettingsService } from './settings.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * AI-01 bilgi bankası — tenant izolasyonu ve davranış kuralları.
 * Bilgi bankası fiyat/kural içerir; bir acentenin fiyatı diğerine sızarsa
 * ticari zarar doğar, o yüzden izolasyon burada da açıkça sınanır.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const actorA = { actorId: randomUUID(), actorDisplayName: 'Owner A' };

describe('bilgi bankası izolasyonu', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let settings: SettingsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				db.transaction(async (tx) => {
					await tx.execute(
						drizzleSql`select set_config('app.current_tenant_id', ${id}, true)`
					);
					return fn({ db: tx as TenantDb });
				})
		} as TenantContextService;

		settings = new SettingsService(tenantContext, new CryptoService());

		// audit_logs.actor_id → user FK; denetim kaydı yazılabilsin diye gerçek satır gerekiyor.
		await sql`
			insert into "user" (id, name, email)
			values (${actorA.actorId}, 'Owner A', ${`kb-owner-${actorA.actorId.slice(0, 8)}@example.com`})
		`;

		for (const [tenantId, name] of [
			[tenantA, 'Knowledge A'],
			[tenantB, 'Knowledge B']
		] as Array<[string, string]>) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, ${name}, ${`kb-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug)
				values (${tenantId}, ${name}, ${`kb-${tenantId.slice(0, 8)}`})
			`;
		}
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await sql`delete from "user" where id = ${actorA.actorId}`;
		await closeDb();
	});

	it('doldurulmamış bilgi bankası boş ve is_default döner', async () => {
		const res = await settings.getKnowledge(tenantA);
		expect(res.is_default).toBe(true);
		expect(res.sections.services).toBe('');
		expect(res.pii_warnings).toEqual([]);
	});

	it('tenant A kaydeder; tenant B onu göremez', async () => {
		await settings.saveKnowledge(
			tenantA,
			{
				sections: {
					services: 'Saç ekimi 2.500 EUR',
					payment: 'Kapora %30',
					faq: '',
					rejection: '',
					notes: ''
				}
			},
			actorA
		);

		const a = await settings.getKnowledge(tenantA);
		expect(a.sections.services).toBe('Saç ekimi 2.500 EUR');
		expect(a.is_default).toBe(false);
		expect(a.updated_by).toBe('Owner A');

		// Fiyat bilgisi başka acenteye sızmamalı.
		const b = await settings.getKnowledge(tenantB);
		expect(b.is_default).toBe(true);
		expect(b.sections.services).toBe('');
	});

	it('hasta verisi izi kaydı engellemez, uyarı olarak döner', async () => {
		const saved = await settings.saveKnowledge(
			tenantA,
			{
				sections: {
					services: 'Saç ekimi 2.500 EUR',
					payment: '',
					faq: '',
					rejection: '',
					notes: 'Ahmet 0532 111 22 33'
				}
			},
			actorA
		);
		// Kayıt geçti — sert engel yok.
		expect(saved.sections.notes).toContain('Ahmet');
		// Ama uyarı verildi.
		expect(saved.pii_warnings.some((w) => w.section === 'notes' && w.kind === 'phone')).toBe(
			true
		);
	});

	it('temizleme sonrası is_default true döner', async () => {
		await settings.deleteKnowledge(tenantA, actorA);
		const res = await settings.getKnowledge(tenantA);
		expect(res.is_default).toBe(true);
		expect(res.sections.services).toBe('');
		expect(res.updated_at).toBeNull();
	});
});
