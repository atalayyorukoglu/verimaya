import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { bearer, organization, twoFactor } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import {
	account,
	invitation,
	member,
	organization as organizationTable,
	session,
	tenants,
	twoFactor as twoFactorTable,
	user,
	verification
} from '../db/schema';
import { getDb } from '../db/client';
import { ac, admin, agent, finance, manager, owner, readonly } from './permissions';

export function createAuth() {
	const { db } = getDb();

	return betterAuth({
		appName: 'Verimaya',
		basePath: '/v1/auth',
		baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
		secret: process.env.BETTER_AUTH_SECRET,
		trustedOrigins: (process.env.TRUSTED_ORIGINS ?? 'http://localhost:5173')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean),
		emailAndPassword: {
			enabled: true
		},
		advanced: {
			database: {
				generateId: 'uuid'
			}
		},
		database: drizzleAdapter(db, {
			provider: 'pg',
			schema: {
				user,
				session,
				account,
				verification,
				organization: organizationTable,
				member,
				invitation,
				twoFactor: twoFactorTable
			}
		}),
		plugins: [
			bearer(),
			organization({
				ac,
				roles: {
					owner,
					admin,
					manager,
					agent,
					finance,
					readonly
				},
				/**
				 * AUDIT-F09-06: hard org delete would delete `organization` while
				 * `tenants.id → organization.id` is ON DELETE restrict — and even before
				 * that, CASCADE used to wipe every tenant-scoped table. Soft-delete the
				 * tenant instead; physical org delete stays disabled.
				 */
				disableOrganizationDeletion: true,
				organizationHooks: {
					afterCreateOrganization: async ({ organization: org }) => {
						await db.insert(tenants).values({
							id: org.id,
							name: org.name,
							slug: org.slug
						});
					},
					afterUpdateOrganization: async ({ organization: org }) => {
						if (!org) return;
						await db
							.update(tenants)
							.set({ name: org.name, slug: org.slug })
							.where(eq(tenants.id, org.id));
					},
					beforeDeleteOrganization: async ({ organization: org }) => {
						// Defense if disableOrganizationDeletion is ever flipped off:
						// soft-delete tenant, then refuse hard delete so restrict FKs hold.
						await db
							.update(tenants)
							.set({ deletedAt: new Date() })
							.where(eq(tenants.id, org.id));
						throw new APIError('BAD_REQUEST', {
							message:
								'Organization hard-delete is disabled; tenant was soft-deleted instead'
						});
					}
				}
			}),
			twoFactor({
				issuer: 'Verimaya'
			})
		]
	});
}

export type Auth = ReturnType<typeof createAuth>;

let authSingleton: Auth | null = null;

export function getAuth(): Auth {
	if (!authSingleton) {
		authSingleton = createAuth();
	}
	return authSingleton;
}
