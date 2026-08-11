import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../db/client';
import { DbService } from '../../db/db.service';
import type { SettingsService } from '../../settings/settings.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { GhlReconcileService } from './ghl.reconcile.service';
import { GhlSyncService } from './ghl.sync.service';
import type { GhlClient, GhlRemoteContact } from './ghl.types';
import { purgeTenantFixtures } from '../../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('GhlReconcileService (Adım 43)', () => {
	const tenantId = randomUUID();
	let sync: GhlSyncService;
	let tenantContext: TenantContextService;
	let remotes: GhlRemoteContact[];

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		process.env.GHL_CLIENT_ID = 'test-client';
		process.env.GHL_CLIENT_SECRET = 'test-secret';

		const { sql } = getDb(databaseUrl);
		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Reconcile T', ${`ghl-r-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Reconcile T', ${`ghl-r-${tenantId.slice(0, 8)}`})
		`;

		const { db } = getDb(databaseUrl);
		const dbService = { client: db, sql } as unknown as DbService;
		tenantContext = new TenantContextService(dbService);
		sync = new GhlSyncService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantId]);
		await closeDb();
		delete process.env.GHL_CLIENT_ID;
		delete process.env.GHL_CLIENT_SECRET;
	});

	beforeEach(() => {
		remotes = [
			{
				id: 'c_rec_1',
				locationId: 'loc-1',
				fullName: 'Reconcile Correct Name',
				phone: '+905551111111',
				email: 'rec@example.com',
				dateUpdated: new Date().toISOString()
			}
		];
	});

	function buildService(): GhlReconcileService {
		const settings = {
			getCredentialStatus: async () => ({ configured: true as const, key_version: 1 })
		} as unknown as SettingsService;

		const client: Pick<GhlClient, 'listContacts'> = {
			listContacts: async () => ({
				contacts: remotes,
				nextStartAfterId: null
			})
		};

		return new GhlReconcileService(
			tenantContext,
			settings,
			sync,
			client as GhlClient
		);
	}

	it('fixes a corrupted local patient then second run finds 0 diffs', async () => {
		const created = await sync.applyRemoteContact(tenantId, remotes[0]!);
		expect(created.action).toBe('created');
		expect(created.contactId).toBeTruthy();

		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`
				update contacts
				set display_name = 'CORRUPTED', phone = '+900000000000'
				where id = ${created.contactId!}
			`;
		});

		const svc = buildService();
		const first = await svc.reconcile(tenantId);
		expect(first.mode).toBe('live');
		expect(first.scanned).toBe(1);
		expect(first.updated).toBe(1);
		expect(first.diffCount).toBe(1);
		expect(first.diffs[0]?.fields).toEqual(expect.arrayContaining(['fullName', 'phone']));

		const fixed = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`
				select display_name, phone from contacts where id = ${created.contactId!}
			`;
		});
		expect(fixed[0]?.display_name).toBe('Reconcile Correct Name');
		expect(fixed[0]?.phone).toBe('+905551111111');

		const second = await svc.reconcile(tenantId);
		expect(second.diffCount).toBe(0);
		expect(second.unchanged).toBe(1);
		expect(second.updated).toBe(0);

		const ledgers = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`
				select payload from jobs
				where tenant_id = ${tenantId} and job_type = 'ghl.reconcile'
				order by created_at desc
				limit 2
			`;
		});
		expect(ledgers).toHaveLength(2);
		expect((ledgers[0]?.payload as { diffCount: number }).diffCount).toBe(0);
		expect((ledgers[1]?.payload as { diffCount: number }).diffCount).toBe(1);
	});

	it('skips when OAuth credential missing', async () => {
		const settings = {
			getCredentialStatus: async () => ({ configured: false as const })
		} as unknown as SettingsService;
		const svc = new GhlReconcileService(
			tenantContext,
			settings,
			sync,
			{ listContacts: async () => ({ contacts: [], nextStartAfterId: null }) } as GhlClient
		);
		const result = await svc.reconcile(tenantId);
		expect(result.mode).toBe('skipped_no_oauth');
		expect(result.scanned).toBe(0);
	});
});
