import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { MessageContactsService } from './message-contacts.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';
import { driveMirrorEnqueueStub } from '../test/drive-mirror-stub';

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

/**
 * KISI-01 izolasyon: bağ yalnız kendi kiracısının kişisine kurulur ve yalnız
 * kendi kiracısından okunur. Aynı ad iki kiracıda da varsa (Claire McLeod)
 * A'nın mesajı B'nin Claire'ine bağlanmaz.
 */
describe('inbound_message_contacts', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const typeA = randomUUID();
	const typeB = randomUUID();
	const claireA = randomUUID();
	const claireB = randomUUID();
	const msgA = randomUUID();
	const msgB = randomUUID();
	let service: MessageContactsService;
	let tenantContext: TenantContextService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`mc-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`mc-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`mc-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`mc-b-${tenantB.slice(0, 8)}`})
		`;

		for (const [tenant, type, contact, msg] of [
			[tenantA, typeA, claireA, msgA],
			[tenantB, typeB, claireB, msgB]
		] as const) {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenant}, true)`;
				await tx`
					insert into contact_types (id, tenant_id, name)
					values (${type}, ${tenant}, 'Hasta')
				`;
				await tx`
					insert into contacts (id, tenant_id, contact_type_id, contact_type_name, first_name, last_name, display_name)
					values (${contact}, ${tenant}, ${type}, 'Hasta', 'Claire', 'McLeod', 'Claire McLeod')
				`;
				await tx`
					insert into inbound_messages (id, tenant_id, provider, external_id, payload, status)
					values (
						${msg}, ${tenant}, 'waha', ${`mc-${tenant.slice(0, 8)}`},
						${JSON.stringify({ payload: { from: '1@g.us', body: 'Claire McLeoda 2000 gbp kart ile odeme alindi.' } })}::jsonb,
						'new'
					)
				`;
			});
		}

		const { db } = getDb(databaseUrl);
		tenantContext = {
			withTenant: async <T>(
				tenantId: string,
				fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>
			) => withTenantSession(tenantId, () => fn({ tx: sql, db }))
		} as TenantContextService;
		service = new MessageContactsService(tenantContext, driveMirrorEnqueueStub());
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it("relinkAll: A'nın mesajı yalnız A'nın Claire'ine bağlanır", async () => {
		const sonuc = await service.relinkAll(tenantA);
		expect(sonuc).toEqual({ processed: 1, linked: 1 });

		const links = await tenantContext.withTenant(tenantA, ({ db }) =>
			service.contactsForMessagesWithDb(db, [msgA, msgB])
		);
		expect(links.get(msgA)).toEqual([
			{ id: claireA, display_name: 'Claire McLeod', method: 'exact' }
		]);
		expect(links.get(msgB)).toBeUndefined();
	});

	it('ikinci koşu aynı bağı tekrar yazmaz', async () => {
		const sonuc = await service.relinkAll(tenantA);
		// linked = bulunan eşleşme sayısı; satır sayısı unique ile sabit kalır.
		expect(sonuc.processed).toBe(1);
		const n = await tenantContext.withTenant(tenantA, ({ db }) =>
			service.countForContactWithDb(db, claireA)
		);
		expect(n).toBe(1);
	});

	it("B, A'nın bağını göremez", async () => {
		const links = await tenantContext.withTenant(tenantB, ({ db }) =>
			service.contactsForMessagesWithDb(db, [msgA])
		);
		expect(links.size).toBe(0);
		const n = await tenantContext.withTenant(tenantB, ({ db }) =>
			service.countForContactWithDb(db, claireA)
		);
		expect(n).toBe(0);
	});
	it('metinsiz görsel mesajı, aynı yazarın 3 dk önceki metinli mesajının kişisine bağlanır', async () => {
		const { sql } = getDb(databaseUrl);
		const yakin = randomUUID();
		const uzak = randomUUID();
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			// Metinli kaynak mesajın zamanı sabit: 12:00. Görseller 12:01 (yakın) ve 12:20 (uzak).
			await tx`update inbound_messages set created_at = '2026-09-14T12:00:00Z' where id = ${msgA}`;
			await tx`
				insert into inbound_messages (id, tenant_id, provider, external_id, payload, status, created_at)
				values
					(${yakin}, ${tenantA}, 'waha', ${`mc-media-1-${tenantA.slice(0, 8)}`},
					 ${JSON.stringify({ payload: { from: '1@g.us', author: 'gulcin', body: '', hasMedia: true } })}::jsonb,
					 'new', '2026-09-14T12:01:00Z'),
					(${uzak}, ${tenantA}, 'waha', ${`mc-media-2-${tenantA.slice(0, 8)}`},
					 ${JSON.stringify({ payload: { from: '1@g.us', author: 'gulcin', body: '', hasMedia: true } })}::jsonb,
					 'new', '2026-09-14T12:20:00Z')
			`;
			await tx`
				update inbound_messages
				set payload = jsonb_set(payload, '{payload,author}', '"gulcin"')
				where id = ${msgA}
			`;
		});

		await service.relinkAll(tenantA);
		const links = await tenantContext.withTenant(tenantA, ({ db }) =>
			service.contactsForMessagesWithDb(db, [yakin, uzak])
		);
		expect(links.get(yakin)).toEqual([
			{ id: claireA, display_name: 'Claire McLeod', method: 'context' }
		]);
		expect(links.get(uzak)).toBeUndefined();
	});

	it('görsel ÖNCE, metin sonra gelse de (ekip 4 bileti atıp altına yazıyor) bağlanır', async () => {
		const { sql } = getDb(databaseUrl);
		const once = randomUUID();
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`
				insert into inbound_messages (id, tenant_id, provider, external_id, payload, status, created_at)
				values (${once}, ${tenantA}, 'waha', ${`mc-media-0-${tenantA.slice(0, 8)}`},
					${JSON.stringify({ payload: { from: '1@g.us', author: 'gulcin', body: '', hasMedia: true } })}::jsonb,
					'new', '2026-09-14T11:59:00Z')
			`;
		});
		await service.relinkAll(tenantA);
		const links = await tenantContext.withTenant(tenantA, ({ db }) =>
			service.contactsForMessagesWithDb(db, [once])
		);
		expect(links.get(once)?.map((c) => c.method)).toEqual(['context']);
	});
	/**
	 * KUCUK-01 — `relinkAll` yakın eşleşme bağlarını da kurar. Kural bağları
	 * türetilmiş veridir: her koşuda silinip baştan yazılır, `fuzzy` de onlardan biri.
	 */
	it('relinkAll yakın yazımı da bağlar ("Zaid waldhu" → "Zaid Waldu")', async () => {
		const { sql } = getDb(databaseUrl);
		const zaid = randomUUID();
		const msgFuzzy = randomUUID();
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`
				insert into contacts (id, tenant_id, contact_type_id, contact_type_name, first_name, last_name, display_name)
				values (${zaid}, ${tenantA}, ${typeA}, 'Hasta', 'Zaid', 'Waldu', 'Zaid Waldu')
			`;
			await tx`
				insert into inbound_messages (id, tenant_id, provider, external_id, payload, status)
				values (
					${msgFuzzy}, ${tenantA}, 'waha', ${`mc-fuzzy-${tenantA.slice(0, 8)}`},
					${JSON.stringify({ payload: { from: '1@g.us', body: 'Zaid waldhu 2.ci vizit' } })}::jsonb,
					'new'
				)
			`;
		});

		await service.relinkAll(tenantA);
		const links = await tenantContext.withTenant(tenantA, ({ db }) =>
			service.contactsForMessagesWithDb(db, [msgFuzzy])
		);
		expect(links.get(msgFuzzy)).toEqual([
			{ id: zaid, display_name: 'Zaid Waldu', method: 'fuzzy' }
		]);
	});
});
