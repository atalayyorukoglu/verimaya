import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { MeService } from './me.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('MeService active organization membership', () => {
	const organizationA = randomUUID();
	const organizationB = randomUUID();
	const validUser = randomUUID();
	const otherOrganizationUser = randomUUID();
	const noMembershipUser = randomUUID();
	const unknownRoleUser = randomUUID();
	let service: MeService;

	beforeAll(async () => {
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${organizationA}, 'Organization A', ${`me-a-${organizationA.slice(0, 8)}`}, now()),
				(${organizationB}, 'Organization B', ${`me-b-${organizationB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${organizationA}, 'Organization A', ${`me-a-${organizationA.slice(0, 8)}`}),
				(${organizationB}, 'Organization B', ${`me-b-${organizationB.slice(0, 8)}`})
		`;
		await sql`
			insert into "user" (id, name, email)
			values
				(${validUser}, 'Valid User', ${`valid-${validUser.slice(0, 8)}@example.com`}),
				(${otherOrganizationUser}, 'Other Organization User', ${`other-${otherOrganizationUser.slice(0, 8)}@example.com`}),
				(${noMembershipUser}, 'No Membership User', ${`none-${noMembershipUser.slice(0, 8)}@example.com`}),
				(${unknownRoleUser}, 'Unknown Role User', ${`unknown-${unknownRoleUser.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (organization_id, user_id, role, created_at)
			values
				(${organizationA}, ${validUser}, 'manager', now()),
				(${organizationB}, ${otherOrganizationUser}, 'admin', now()),
				(${organizationA}, ${unknownRoleUser}, 'unrecognized_role', now())
		`;

		const dbService = { client: db, sql } as unknown as DbService;
		service = new MeService(dbService, new TenantContextService(dbService));
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql`delete from member where organization_id in (${organizationA}, ${organizationB})`;
		await sql`delete from "user" where id in (${validUser}, ${otherOrganizationUser}, ${noMembershipUser}, ${unknownRoleUser})`;
		await purgeTenantFixtures(sql, [organizationA, organizationB]);
		await closeDb();
	});

	it('rejects a session without an active organization', async () => {
		await expect(
			service.resolveMembershipUser({
				userId: validUser,
				activeOrganizationId: null,
				requestId: 'request-no-active-organization'
			})
		).rejects.toMatchObject<BadRequestException>({
			response: {
				error: { code: 'active_organization_required' }
			}
		});
	});

	it('does not resolve a role from membership in another organization', async () => {
		await expect(
			service.resolveMembershipUser({
				userId: otherOrganizationUser,
				activeOrganizationId: organizationA,
				requestId: 'request-other-organization'
			})
		).rejects.toMatchObject<ForbiddenException>({
			response: {
				error: { code: 'organization_membership_required' }
			}
		});
	});

	it('rejects a user without membership in the active organization', async () => {
		await expect(
			service.resolveMembershipUser({
				userId: noMembershipUser,
				activeOrganizationId: organizationA,
				requestId: 'request-no-membership'
			})
		).rejects.toMatchObject<ForbiddenException>({
			response: {
				error: { code: 'organization_membership_required' }
			}
		});
	});

	it('rejects an unknown stored role fail-closed', async () => {
		await expect(
			service.resolveMembershipUser({
				userId: unknownRoleUser,
				activeOrganizationId: organizationA,
				requestId: 'request-unknown-role'
			})
		).rejects.toMatchObject<ForbiddenException>({
			response: {
				error: { code: 'organization_membership_required' }
			}
		});
	});

	it('maps a valid membership to the shared Me contract with empty preferences', async () => {
		await expect(
			service.resolveMembershipUser({
				userId: validUser,
				activeOrganizationId: organizationA,
				requestId: 'request-valid-membership'
			})
		).resolves.toMatchObject({
			id: validUser,
			email: `valid-${validUser.slice(0, 8)}@example.com`,
			display_name: 'Valid User',
			tenant_id: organizationA,
			role: 'manager',
			platform_admin: false,
			preferences: { enabled_product_modules: [] }
		});
	});

	it('sets platform_admin when email is in PLATFORM_ADMIN_EMAILS', async () => {
		const email = `valid-${validUser.slice(0, 8)}@example.com`;
		const prev = process.env.PLATFORM_ADMIN_EMAILS;
		process.env.PLATFORM_ADMIN_EMAILS = email;
		try {
			await expect(
				service.resolveMembershipUser({
					userId: validUser,
					activeOrganizationId: organizationA,
					requestId: 'request-platform-admin',
					email
				})
			).resolves.toMatchObject({ platform_admin: true });
		} finally {
			if (prev === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
			else process.env.PLATFORM_ADMIN_EMAILS = prev;
		}
	});

	it('saves and returns preferences on subsequent me resolve', async () => {
		await expect(
			service.savePreferences(validUser, organizationA, {
				enabled_product_modules: ['campaign-assistant']
			})
		).resolves.toEqual({ enabled_product_modules: ['campaign-assistant'] });

		await expect(
			service.resolveMembershipUser({
				userId: validUser,
				activeOrganizationId: organizationA,
				requestId: 'request-with-prefs'
			})
		).resolves.toMatchObject({
			preferences: { enabled_product_modules: ['campaign-assistant'] }
		});
	});

	it('replace semantics clear previously enabled modules', async () => {
		await service.savePreferences(validUser, organizationA, {
			enabled_product_modules: ['campaign-assistant']
		});
		await expect(
			service.savePreferences(validUser, organizationA, {
				enabled_product_modules: []
			})
		).resolves.toEqual({ enabled_product_modules: [] });
		await expect(service.getPreferences(validUser, organizationA)).resolves.toEqual({
			enabled_product_modules: []
		});
	});
});
