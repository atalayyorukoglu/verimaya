import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ContactsService } from './contacts.service';
import { ContactVisitsService } from './contact-visits.service';
import { ContactVisitSuggestionsService } from './contact-visit-suggestions.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(
	tenantId: string,
	fn: (tdb: TenantDb) => Promise<T>
): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
		return fn(tx as TenantDb);
	});
}

/**
 * VIZIT-01 — RLS: A kiracısının viziti B'de yok. Vizit en mahrem kayıtlardan biri
 * (hangi hasta ne zaman nerede) — sızarsa en pahalı sızıntı bu olur.
 */
describe('contact visits isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let patientA: string;
	let patientB: string;
	let visitA: string;
	let visits: ContactVisitsService;
	let suggestions: ContactVisitSuggestionsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const dbHandle = getDb(databaseUrl);
		const { sql } = dbHandle;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, (tdb) => fn({ db: tdb }))
		} as TenantContextService;

		const contactsService = new ContactsService(tenantContext, new LocalFileStorage());
		visits = new ContactVisitsService(tenantContext);
		suggestions = new ContactVisitSuggestionsService(tenantContext, visits);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`cv-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`cv-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`cv-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`cv-b-${tenantB.slice(0, 8)}`})
		`;

		const contactTypeFor = async (tenantId: string) =>
			sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
				const [row] = await tx`
					insert into contact_types (tenant_id, name, sort_order)
					values (${tenantId}, 'Hasta', 0) returning id
				`;
				return row!.id as string;
			});
		const typeA = await contactTypeFor(tenantA);
		const typeB = await contactTypeFor(tenantB);

		patientA = await withTenantSession(tenantA, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: typeA,
				first_name: 'Visit Patient A'
			});
			return p.id;
		});
		patientB = await withTenantSession(tenantB, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantB, {
				contact_type_id: typeB,
				first_name: 'Visit Patient B'
			});
			return p.id;
		});

		visitA = await withTenantSession(tenantA, async (tdb) => {
			const v = await visits.createWithDb(
				tdb,
				tenantA,
				patientA,
				{
					visit_type: 'visit_2',
					sequence: 2,
					arrival_at: '2026-09-13T21:35:00.000Z',
					departure_at: '2026-09-19T22:15:00.000Z',
					hotel: 'Cedrus',
					clinic: 'TNC',
					treatment_plan: 'All on 6'
				},
				{ displayName: 'Gülçin' }
			);
			return v.id;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it("A'nın viziti A'da görünür", async () => {
		const items = await visits.list(tenantA, patientA);
		expect(items.items).toHaveLength(1);
		expect(items.items[0]!.id).toBe(visitA);
		expect(items.items[0]!.visit_type).toBe('visit_2');
		expect(items.items[0]!.hotel).toBe('Cedrus');
		expect(items.items[0]!.created_by).toBe('Gülçin');
	});

	it("A'nın viziti B'nin listesinde yok", async () => {
		const items = await visits.list(tenantB, patientB);
		expect(items.items).toHaveLength(0);
	});

	it("B, A'nın vizitini kimliğiyle bile okuyamaz/güncelleyemez", async () => {
		await expect(
			withTenantSession(tenantB, (tdb) =>
				visits.updateWithDb(tdb, patientA, visitA, { status: 'completed' })
			)
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("B, A'nın kişisine vizit ekleyemez", async () => {
		await expect(
			withTenantSession(tenantB, (tdb) =>
				visits.createWithDb(tdb, tenantB, patientA, { visit_type: 'rpt' }, { displayName: 'X' })
			)
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('yumuşak silme listeden düşürür ve durumu cancelled yapar', async () => {
		const gecici = await withTenantSession(tenantA, (tdb) =>
			visits.createWithDb(tdb, tenantA, patientA, { visit_type: 'rpt' }, { displayName: 'Sude' })
		);
		const sonuc = await withTenantSession(tenantA, (tdb) =>
			visits.softDeleteWithDb(tdb, patientA, gecici.id)
		);
		expect(sonuc).toEqual({ id: gecici.id, deleted: true });

		const items = await visits.list(tenantA, patientA);
		expect(items.items.map((v) => v.id)).not.toContain(gecici.id);

		const { sql } = getDb(databaseUrl);
		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select status from contact_visits where id = ${gecici.id}`;
		});
		expect(rows[0]!.status).toBe('cancelled');
	});

	it('öneri onayı vizit doğurur; ikinci onay çakışır', async () => {
		const oneri = await withTenantSession(tenantA, (tdb) =>
			suggestions.createFromMessageWithDb(tdb, tenantA, {
				contactId: patientA,
				// Mesaj kaydı olmadan da öneri yazılabilmeli (elle/servis yolu).
				inboundMessageId: null,
				draft: {
					visit_type: 'rpt',
					sequence: null,
					arrival_at: '2026-10-01T10:00:00.000Z',
					arrival_time_known: true,
					departure_at: '2026-10-08T10:00:00.000Z',
					departure_time_known: true,
					hotel: 'Dumos',
					clinic: 'Dentgroup',
					doctor: null,
					treatment_plan: null
				},
				sourceText: 'Test RPT mesajı',
				confidence: 'high'
			})
		);
		expect(oneri).not.toBeNull();

		const onayli = await withTenantSession(tenantA, (tdb) =>
			suggestions.approveWithDb(tdb, oneri!.id, { actorId: null, actorDisplayName: 'Sude' }, {})
		);
		expect(onayli.status).toBe('approved');
		expect(onayli.created_visit_id).not.toBeNull();

		const items = await visits.list(tenantA, patientA);
		expect(items.items.some((v) => v.id === onayli.created_visit_id)).toBe(true);

		await expect(
			withTenantSession(tenantA, (tdb) =>
				suggestions.approveWithDb(tdb, oneri!.id, { actorId: null, actorDisplayName: 'Sude' }, {})
			)
		).rejects.toThrow();
	});

	it("B, A'nın önerisini görmez", async () => {
		const bekleyen = await suggestions.list(tenantB, { status: 'pending', limit: 50 });
		expect(bekleyen.items).toHaveLength(0);
	});
});
