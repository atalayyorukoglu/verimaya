import { relations } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

const authTs = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** better-auth core + twoFactor field on user */
export const user = pgTable(
	'user',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		name: text('name').notNull(),
		email: text('email').notNull(),
		emailVerified: boolean('email_verified').notNull().default(false),
		image: text('image'),
		twoFactorEnabled: boolean('two_factor_enabled').default(false),
		createdAt: authTs('created_at').notNull().defaultNow(),
		updatedAt: authTs('updated_at')
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(table) => [uniqueIndex('user_email_uidx').on(table.email)]
);

export const session = pgTable(
	'session',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		expiresAt: authTs('expires_at').notNull(),
		token: text('token').notNull(),
		createdAt: authTs('created_at').notNull().defaultNow(),
		updatedAt: authTs('updated_at')
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		activeOrganizationId: uuid('active_organization_id')
	},
	(table) => [
		uniqueIndex('session_token_uidx').on(table.token),
		index('session_user_id_idx').on(table.userId)
	]
);

export const account = pgTable(
	'account',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: authTs('access_token_expires_at'),
		refreshTokenExpiresAt: authTs('refresh_token_expires_at'),
		scope: text('scope'),
		password: text('password'),
		createdAt: authTs('created_at').notNull().defaultNow(),
		updatedAt: authTs('updated_at')
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(table) => [index('account_user_id_idx').on(table.userId)]
);

export const verification = pgTable(
	'verification',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: authTs('expires_at').notNull(),
		createdAt: authTs('created_at').notNull().defaultNow(),
		updatedAt: authTs('updated_at')
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
);

export const organization = pgTable(
	'organization',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		logo: text('logo'),
		createdAt: authTs('created_at').notNull(),
		metadata: text('metadata')
	},
	(table) => [uniqueIndex('organization_slug_uidx').on(table.slug)]
);

export const member = pgTable(
	'member',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role').notNull().default('member'),
		createdAt: authTs('created_at').notNull()
	},
	(table) => [
		index('member_organization_id_idx').on(table.organizationId),
		index('member_user_id_idx').on(table.userId)
	]
);

export const invitation = pgTable(
	'invitation',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		role: text('role'),
		status: text('status').notNull().default('pending'),
		expiresAt: authTs('expires_at').notNull(),
		createdAt: authTs('created_at').notNull().defaultNow(),
		inviterId: uuid('inviter_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' })
	},
	(table) => [
		index('invitation_organization_id_idx').on(table.organizationId),
		index('invitation_email_idx').on(table.email)
	]
);

export const twoFactor = pgTable(
	'two_factor',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		secret: text('secret').notNull(),
		backupCodes: text('backup_codes').notNull(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		verified: boolean('verified').default(true),
		failedVerificationCount: integer('failed_verification_count').default(0),
		lockedUntil: authTs('locked_until')
	},
	(table) => [
		index('two_factor_secret_idx').on(table.secret),
		index('two_factor_user_id_idx').on(table.userId)
	]
);

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	members: many(member),
	twoFactors: many(twoFactor)
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] })
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, { fields: [account.userId], references: [user.id] })
}));

export const organizationRelations = relations(organization, ({ many }) => ({
	members: many(member),
	invitations: many(invitation)
}));

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id]
	}),
	user: one(user, { fields: [member.userId], references: [user.id] })
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id]
	}),
	inviter: one(user, { fields: [invitation.inviterId], references: [user.id] })
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
	user: one(user, { fields: [twoFactor.userId], references: [user.id] })
}));
