import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { WhatsappChatsService } from './whatsapp-chats.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
	const { sql } = getDb(databaseUrl);
	await sql`select set_config('app.current_tenant_id', ${tenantId}, false)`;
	try {
		return await fn();
	} finally {
		await sql`select set_config('app.current_tenant_id', '', false)`;
	}
}

describe('whatsapp_chats', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const grupA = `12036300000000000${Math.floor(Math.random() * 9)}@g.us`;
	const grupB = `12036311111111111${Math.floor(Math.random() * 9)}@g.us`;
	let service: WhatsappChatsService;
	let tenantContext: TenantContextService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`wc-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`wc-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`wc-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`wc-b-${tenantB.slice(0, 8)}`})
		`;

		// A'ya iki, B'ye bir mesaj. Sohbet kimliği WAHA'nın grup biçiminde
		// (`payload.payload.from`) — okuma SQL'i bu yolu bulmalı.
		for (const [tenant, chat, adet] of [
			[tenantA, grupA, 2],
			[tenantB, grupB, 1]
		] as const) {
			for (let i = 0; i < adet; i += 1) {
				await sql.begin(async (tx) => {
					await tx`select set_config('app.current_tenant_id', ${tenant}, true)`;
					await tx`
						insert into inbound_messages (tenant_id, provider, external_id, payload, status)
						values (
							${tenant},
							'waha',
							${`wc-${tenant.slice(0, 8)}-${i}`},
							${JSON.stringify({ payload: { from: chat, body: `mesaj ${i}` } })}::jsonb,
							'new'
						)
					`;
				});
			}
		}

		tenantContext = {
			withTenant: async <T>(
				tenantId: string,
				fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>
			) => withTenantSession(tenantId, () => fn({ tx: sql, db }))
		} as TenantContextService;

		service = new WhatsappChatsService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('adlandırılmamış sohbet gelen mesajlardan bulunur', async () => {
		const sonuc = await service.list(tenantA);
		const aday = sonuc.unnamed.find((u) => u.chat_id === grupA);
		expect(aday, 'A grubu adsız listesinde olmalı').toBeTruthy();
		expect(aday!.message_count).toBe(2);
		expect(aday!.last_body).toContain('mesaj');
	});

	it('başka kiracının sohbeti görünmez', async () => {
		const sonuc = await service.list(tenantA);
		const hepsi = [...sonuc.items.map((i) => i.chat_id), ...sonuc.unnamed.map((u) => u.chat_id)];
		expect(hepsi).not.toContain(grupB);
	});

	it('adlandırılan sohbet adsız listesinden çıkar ve sayısını taşır', async () => {
		await withTenantSession(tenantA, async () => {
			const { db } = getDb(databaseUrl);
			await service.createWithDb(db, tenantA, {
				chat_id: grupA,
				name: 'Muhasebe',
				purpose: 'finance'
			});
		});

		const sonuc = await service.list(tenantA);
		expect(sonuc.unnamed.map((u) => u.chat_id)).not.toContain(grupA);
		const kayit = sonuc.items.find((i) => i.chat_id === grupA);
		expect(kayit?.name).toBe('Muhasebe');
		expect(kayit?.purpose).toBe('finance');
		expect(kayit?.message_count).toBe(2);
	});

	it('aynı sohbet ikinci kez eklenemez', async () => {
		await expect(
			withTenantSession(tenantA, async () => {
				const { db } = getDb(databaseUrl);
				return service.createWithDb(db, tenantA, {
					chat_id: grupA,
					name: 'Tekrar',
					purpose: 'mixed'
				});
			})
		).rejects.toThrow();
	});

	it('defter sohbet kimliğinden adı çözer', async () => {
		const defter = await withTenantSession(tenantA, async () => {
			const { db } = getDb(databaseUrl);
			return service.directoryWithDb(db);
		});
		expect(defter.get(grupA)).toEqual({ name: 'Muhasebe', purpose: 'finance' });
	});
});
