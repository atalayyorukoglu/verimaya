import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { MessageContactsService } from './message-contacts.service';
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
		service = new MessageContactsService(tenantContext);
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
});
