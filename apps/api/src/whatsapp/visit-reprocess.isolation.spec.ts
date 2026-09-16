import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { ContactVisitSuggestionsService } from '../contacts/contact-visit-suggestions.service';
import { ContactVisitsService } from '../contacts/contact-visits.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';
import { VisitReprocessService } from './visit-reprocess.service';

/**
 * PARA-01 — geçmiş tarama ucu.
 *
 * Üç şey: (1) `archived` mesaj da taranır, (2) ikinci çalıştırma yeni öneri
 * açmaz (kısmi tekil indeks), (3) başka tenant'ın mesajı hiç görülmez.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantDb<T>(tenantId: string, fn: (db: TenantDb) => Promise<T>): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
		return fn(tx as TenantDb);
	});
}

const VISIT_TEXT =
	'Zaid Waldu, ikinci vizit\nGeliş: 13.09.2026 21:35\nDönüş: 19.09.2026 22:15\nrandevusunun oluşturulmasını rica ederim';

describe('visit reprocess tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let patientA: string;
	let service: VisitReprocessService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`})
		`;

		const kur = async (tenantId: string, name: string) =>
			sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
				await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantId}, 'Hasta', 0)
					on conflict (tenant_id, name) do update set name = excluded.name`;
				const [contact] = await tx`
					insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
					values (
						${tenantId},
						(select id from contact_types where tenant_id = ${tenantId} and name = 'Hasta' limit 1),
						'Hasta', ${name}, ${name}
					)
					returning id
				`;
				// Kuyruktan düşmüş satır: tarama `archived` olanı da görmeli.
				const [msg] = await tx`
					insert into inbound_messages (tenant_id, provider, external_id, payload, status)
					values (
						${tenantId}, 'waha', ${`ext-${randomUUID()}`},
						${JSON.stringify({ payload: { body: VISIT_TEXT, chatName: 'TNC Rezervasyon' } })}::jsonb,
						'archived'
					)
					returning id
				`;
				await tx`
					insert into inbound_message_contacts (tenant_id, inbound_message_id, contact_id, method)
					values (${tenantId}, ${msg!.id}, ${contact!.id}, 'exact')
				`;
				return contact!.id as string;
			});

		patientA = await kur(tenantA, 'Zaid Waldu');
		await kur(tenantB, 'Other Patient');

		const tenantContext = {
			withTenant: async <T>(tenantId: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantDb(tenantId, (db) => fn({ db }))
		} as TenantContextService;

		service = new VisitReprocessService(
			new ContactVisitSuggestionsService(tenantContext, new ContactVisitsService(tenantContext))
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('arşivlenmiş mesajı tarar ve öneri açar; ikinci çalıştırma yeni öneri açmaz', async () => {
		const first = await withTenantDb(tenantA, (db) => service.reprocessWithDb(db, tenantA));
		expect(first.scanned).toBe(1);
		expect(first.suggested).toBe(1);

		const second = await withTenantDb(tenantA, (db) => service.reprocessWithDb(db, tenantA));
		expect(second.scanned).toBe(1);
		expect(second.suggested).toBe(0);

		const { sql } = getDb(databaseUrl);
		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select contact_id from contact_visit_suggestions where tenant_id = ${tenantA}`;
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]!.contact_id).toBe(patientA);
	});

	it('Tenant A taraması Tenant B mesajını görmez', async () => {
		await withTenantDb(tenantA, (db) => service.reprocessWithDb(db, tenantA));
		const { sql } = getDb(databaseUrl);
		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`select id from contact_visit_suggestions where tenant_id = ${tenantB}`;
		});
		expect(rows).toHaveLength(0);
	});
});
