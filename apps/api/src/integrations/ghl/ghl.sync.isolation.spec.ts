import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../db/client';
import { DbService } from '../../db/db.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { GhlSyncService } from './ghl.sync.service';
import { purgeTenantFixtures } from '../../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('GhlSyncService tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let syncService: GhlSyncService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`ghl-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`ghl-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`ghl-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`ghl-b-${tenantB.slice(0, 8)}`})
		`;

		const { db } = getDb(databaseUrl);
		const dbService = { client: db, sql } as unknown as DbService;
		syncService = new GhlSyncService(new TenantContextService(dbService));
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('upserts patient for tenant A and does not leak to tenant B', async () => {
		const externalId = 'c_iso_1';
		const resultA = await syncService.processInboundEvent({
			integrationEventId: randomUUID(),
			tenantId: tenantA,
			payload: {
				type: 'ContactCreate',
				contact: {
					id: externalId,
					fullName: 'Isolation Patient A',
					phone: '+905550000001',
					email: 'a@example.com'
				}
			}
		});
		expect(resultA.action).toBe('contact_created');
		expect(resultA.contactId).toBeTruthy();

		const again = await syncService.processInboundEvent({
			integrationEventId: randomUUID(),
			tenantId: tenantA,
			payload: {
				type: 'ContactUpdate',
				contact: {
					id: externalId,
					fullName: 'Isolation Patient A Updated',
					phone: '+905550000001',
					email: 'a@example.com'
				}
			}
		});
		expect(again.action).toBe('contact_updated');
		expect(again.contactId).toBe(resultA.contactId);

		const { sql } = getDb(databaseUrl);
		const visibleToB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`
				select id from contacts
				where id = ${resultA.contactId!} and deleted_at is null
			`;
		});
		expect(visibleToB).toHaveLength(0);

		const visibleToA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select display_name, source from contacts
				where id = ${resultA.contactId!} and deleted_at is null
			`;
		});
		expect(visibleToA).toHaveLength(1);
		expect(visibleToA[0]?.display_name).toBe('Isolation Patient A Updated');
		expect(visibleToA[0]?.source).toBe('ghl');

		const mapping = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select external_id, internal_id from external_ids
				where source = 'ghl' and entity_type = 'contact' and external_id = ${externalId}
			`;
		});
		expect(mapping).toHaveLength(1);
		expect(mapping[0]?.internal_id).toBe(resultA.contactId);

		const notesRow = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select notes from contacts where id = ${resultA.contactId!}`;
		});
		expect(notesRow[0]?.notes).toBeNull();
	});
});
