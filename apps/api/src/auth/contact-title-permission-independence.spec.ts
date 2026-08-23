import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ContactsService } from '../contacts/contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';
import { hasOrgPermission } from './permissions';

/**
 * BAĞLAYICI KURAL (AGENTS.md, docs/2026-08-23-maya-icgoru-sorulari.md § Risk 1):
 * ünvan hiçbir izin kontrolünde okunmaz. `hasOrgPermission` yalnız
 * `(role, resource, action, deniedKeys)` alır — imzasında `title` yoktur ve tek yetki
 * kaynağı `member.role`'dür.
 *
 * Bu test bunu davranışla kanıtlar: bir kullanıcıya bağlı kişi kaydının ünvanı
 * değiştirilir, ve o kullanıcının hem `member.role`'ü hem de aynı role üzerinden
 * hesaplanan izin kararı aynı kalır — ünvan hiçbir şeyi etkilemez.
 *
 * Tenant mock: drizzle `db.transaction` + SET LOCAL (is_local=true) (AGENTS.md).
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('contact title change does not affect the permission decision', () => {
	const tenantId = randomUUID();
	const userId = randomUUID();
	const memberId = randomUUID();
	let service: ContactsService;
	let runWithTenant: <T>(fn: (db: TenantDb) => Promise<T>) => Promise<T>;
	let contactTypeId: string;
	let titleHekim: string;
	let titleKoordinator: string;
	let contactId: string;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		runWithTenant = async (fn) =>
			db.transaction(async (tx) => {
				await tx.execute(
					drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`
				);
				return fn(tx as TenantDb);
			});

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				db.transaction(async (tx) => {
					await tx.execute(
						drizzleSql`select set_config('app.current_tenant_id', ${id}, true)`
					);
					return fn({ db: tx as TenantDb });
				})
		} as TenantContextService;

		service = new ContactsService(tenantContext, new LocalFileStorage());

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Permission Independence', ${`title-perm-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Permission Independence', ${`title-perm-${tenantId.slice(0, 8)}`})
		`;
		await sql`
			insert into "user" (id, name, email, email_verified, created_at, updated_at)
			values (
				${userId},
				'Titled Agent',
				${`titled-agent-${userId.slice(0, 8)}@example.com`},
				true,
				now(),
				now()
			)
		`;
		// AUDIT-F09-02 role model: `member.role` is the ONLY input to hasOrgPermission.
		// 'agent' has finance:read but not finance:update (see permissions.spec.ts).
		await sql`
			insert into member (id, organization_id, user_id, role, created_at)
			values (${memberId}, ${tenantId}, ${userId}, 'agent', now())
		`;

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [ct] = await tx`
				insert into contact_types (tenant_id, name) values (${tenantId}, 'Personel') returning id
			`;
			contactTypeId = ct!.id as string;
			const [t1] = await tx`
				insert into contact_titles (tenant_id, name) values (${tenantId}, 'Hekim') returning id
			`;
			const [t2] = await tx`
				insert into contact_titles (tenant_id, name) values (${tenantId}, 'Koordinatör') returning id
			`;
			titleHekim = t1!.id as string;
			titleKoordinator = t2!.id as string;
		});

		contactId = await runWithTenant(async (tx) => {
			const created = await service.createWithDb(tx, tenantId, {
				contact_type_id: contactTypeId,
				title_id: titleHekim,
				first_name: 'Titled',
				last_name: 'Agent',
				assigned_user_id: userId
			});
			return created.id;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantId]);
		await sql`delete from "user" where id = ${userId}`;
		await closeDb();
	});

	async function currentRole(): Promise<string> {
		const { sql } = getDb(databaseUrl);
		const [row] = await sql`
			select role from member where id = ${memberId}
		`;
		return row!.role as string;
	}

	it('changing the linked contact title leaves member.role and the permission decision unchanged', async () => {
		const roleBefore = await currentRole();
		expect(roleBefore).toBe('agent');

		const readBefore = hasOrgPermission(roleBefore as 'agent', 'finance', 'read');
		const updateBefore = hasOrgPermission(roleBefore as 'agent', 'finance', 'update');
		expect(readBefore).toBe(true);
		expect(updateBefore).toBe(false);

		// Change the title on the contact linked to this user — title is the only
		// thing that moves here; no permission-related row is touched.
		const retitled = await runWithTenant((tx) =>
			service.updateWithDb(tx, contactId, { title_id: titleKoordinator })
		);
		expect(retitled.title_id).toBe(titleKoordinator);
		expect(retitled.title_name).toBe('Koordinatör');

		const roleAfter = await currentRole();
		expect(roleAfter).toBe(roleBefore);

		const readAfter = hasOrgPermission(roleAfter as 'agent', 'finance', 'read');
		const updateAfter = hasOrgPermission(roleAfter as 'agent', 'finance', 'update');
		expect(readAfter).toBe(readBefore);
		expect(updateAfter).toBe(updateBefore);
	});

	it('hasOrgPermission has no title parameter — role is the only identity input it accepts', () => {
		// Structural guard: the call below type-checks with exactly (role, resource,
		// action, deniedKeys?). Passing a title would be a compile error, which is the
		// point — there is no code path for a title to reach this function.
		expect(hasOrgPermission.length).toBeLessThanOrEqual(4);
	});
});
