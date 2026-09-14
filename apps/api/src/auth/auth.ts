import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { bearer, organization, twoFactor } from 'better-auth/plugins';
import { eq, sql } from 'drizzle-orm';
import {
	account,
	invitation,
	member,
	organization as organizationTable,
	auditLogs,
	session,
	tenants,
	twoFactor as twoFactorTable,
	user,
	verification
} from '../db/schema';
import { getDb } from '../db/client';
import { ac, admin, agent, finance, manager, owner, readonly } from './permissions';
import { buildLoginAuditRow } from './login-audit';

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
			enabled: true,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async ({ user, url }) => {
				const { createEmailSenderFromEnv } = await import('../integrations/email/resend.client');
				const mailer = createEmailSenderFromEnv();
				void mailer.send({
					to: user.email,
					subject: 'Verimaya — şifre sıfırlama',
					text: `Şifrenizi sıfırlamak için bu bağlantıya tıklayın:\n\n${url}\n\nBağlantı yaklaşık 1 saat geçerlidir. Siz istemediyseniz bu e-postayı yok sayın.`,
					html: `<p>Şifrenizi sıfırlamak için <a href="${url}">bu bağlantıya</a> tıklayın.</p><p style="color:#6b6b68;font-size:13px">Bağlantı yaklaşık 1 saat geçerlidir. Siz istemediyseniz bu e-postayı yok sayın.</p>`
				});
			}
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
		hooks: {
			/**
			 * Giriş denetimi. `audit_logs` firmaya bağlı olduğu için kayıt, oturum
			 * açıldığı anda değil firmanın seçildiği anda yazılır (bkz. login-audit.ts).
			 *
			 * Denetim yazımı girişi ASLA engellemez: hata yutulur ve loglanır.
			 */
			after: createAuthMiddleware(async (ctx) => {
				const row = buildLoginAuditRow(ctx);
				if (!row) return;
				try {
					// RLS: `audit_logs` yalnız `app.current_tenant_id` kurulmuş bir işlem
					// içinde yazılabiliyor. better-auth'un bağlantısı tenant bağlamı
					// taşımıyor; ilk sürüm bu yüzden sessizce reddedildi, kayıt hiç düşmedi.
					// Kullanıcıyı better-auth'un kendi çözücüsüyle buluyoruz.
					//
					// Üç deneme sonra buraya gelindi: `context.session` ve
					// `context.newSession` after hook'unda boş; `Authorization: Bearer`
					// ise panel çerez kullandığı için hiç gelmiyor. `getSessionFromCtx`
					// çerez de bearer de olsa oturumu çözüyor — kimliği tahmin etmek
					// yerine kütüphanenin kendi yolundan sormak doğrusu.
					let actor = row.actor;
					if (!actor) {
						const resolved = await getSessionFromCtx(ctx).catch(() => null);
						const u = resolved?.user;
						if (u?.id) {
							actor = {
								actorId: u.id,
								actorDisplayName: u.name?.trim() || u.email || 'Bilinmeyen kullanıcı'
							};
						}
					}
					if (!actor) actor = { actorId: null, actorDisplayName: 'Bilinmeyen kullanıcı' };

					await db.transaction(async (tx) => {
						await tx.execute(
							sql`select set_config('app.current_tenant_id', ${row.tenantId}, true)`
						);
						await tx.insert(auditLogs).values({
							tenantId: row.tenantId,
							actorId: actor.actorId,
							actorDisplayName: actor.actorDisplayName,
							action: 'login',
							entityType: 'tenant',
							entityLabel: null
						});
					});
				} catch (error) {
					console.warn(
						`[auth] giriş denetim kaydı yazılamadı: ${error instanceof Error ? error.message : String(error)}`
					);
				}
			})
		},
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
						await db.update(tenants).set({ deletedAt: new Date() }).where(eq(tenants.id, org.id));
						throw new APIError('BAD_REQUEST', {
							message: 'Organization hard-delete is disabled; tenant was soft-deleted instead'
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
