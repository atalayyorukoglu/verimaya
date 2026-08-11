import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { contactDataDeletionRequests } from '../db/schema/contact-data-deletion-requests';
import { contacts } from '../db/schema/contacts';
import { transactions } from '../db/schema/transactions';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';
import { ContactDataSubjectService } from './contact-data-subject.service';

/**
 * AUDIT-F09-07b: contact data-export + data-deletion-request.
 * Tenant mock mirrors production: drizzle transaction + SET LOCAL (is_local=true).
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const actorA = { actorId: null as string | null, actorDisplayName: 'AuditF09-07b A' };

async function withTenantSession<T>(
	tenantId: string,
	fn: (tdb: TenantDb) => Promise<T>
): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(
			drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`
		);
		return fn(tx as TenantDb);
	});
}

describe('AUDIT-F09-07b contact data-subject rights isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactA: string;
	let contactB: string;
	let txA: string;
	let service: ContactDataSubjectService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'CDS Tenant A', ${`cds-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'CDS Tenant B', ${`cds-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'CDS Tenant A', ${`cds-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'CDS Tenant B', ${`cds-b-${tenantB.slice(0, 8)}`})
		`;

		contactA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantA}, 'Hasta', 0)
				on conflict (tenant_id, name) do update set name = excluded.name`;
			const [row] = await tx`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name,
					first_name, last_name, display_name, phone, email
				)
				values (
					${tenantA},
					(select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1),
					'Hasta', 'Ada', 'Yılmaz', 'Ada Yılmaz', '+905551112233', ${`ada-${tenantA.slice(0, 8)}@example.com`}
				)
				returning id`;
			const [txRow] = await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, currency,
					contact_id, contact_display_name
				)
				values (
					${tenantA}, 'income', 'Deposit A', current_date, 'paid', 10000, 'TRY',
					${row!.id}, 'Ada Yılmaz'
				)
				returning id`;
			txA = txRow!.id as string;
			await tx`
				insert into case_notes (tenant_id, contact_id, body, author_display_name)
				values (${tenantA}, ${row!.id}, 'secret note A', 'Agent A')
			`;
			return row!.id as string;
		});

		contactB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantB}, 'Hasta', 0)
				on conflict (tenant_id, name) do update set name = excluded.name`;
			const [row] = await tx`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name,
					first_name, last_name, display_name, phone, email
				)
				values (
					${tenantB},
					(select id from contact_types where tenant_id = ${tenantB} and name = 'Hasta' limit 1),
					'Hasta', 'Bora', 'Secret', 'Bora Secret', '+905559998877', ${`bora-${tenantB.slice(0, 8)}@example.com`}
				)
				returning id`;
			await tx`
				insert into case_notes (tenant_id, contact_id, body, author_display_name)
				values (${tenantB}, ${row!.id}, 'tenant-b-secret-note', 'Agent B')
			`;
			return row!.id as string;
		});

		const tenantContext = {
			withTenant: async <T>(
				tenantId: string,
				fn: (ctx: { db: typeof db }) => Promise<T>
			) => withTenantSession(tenantId, (tdb) => fn({ db: tdb }))
		} as TenantContextService;

		service = new ContactDataSubjectService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant A export cannot read Tenant B contact or Tenant B case notes', async () => {
		const exported = await service.exportData(tenantA, contactA);

		expect(exported.tenant_id).toBe(tenantA);
		expect(exported.contact.id).toBe(contactA);
		expect(exported.contact.email).toContain('ada-');
		expect(exported.case_notes.every((n) => n.tenant_id === tenantA)).toBe(true);
		expect(exported.case_notes.some((n) => n.body === 'tenant-b-secret-note')).toBe(false);
		expect(JSON.stringify(exported)).not.toContain('Bora Secret');
		expect(JSON.stringify(exported)).not.toContain('tenant-b-secret-note');
	});

	it('Tenant A cannot export Tenant B contact id under Tenant A context', async () => {
		await expect(service.exportData(tenantA, contactB)).rejects.toBeInstanceOf(NotFoundException);
	});

	it('Tenant A cannot file deletion for Tenant B contact', async () => {
		await expect(
			service.requestDeletion(tenantA, contactB, { ...actorA, actorId: null })
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('deletion-request anonymizes identity fields but keeps finance contact_id', async () => {
		const beforeEmail = `ada-${tenantA.slice(0, 8)}@example.com`;
		const result = await service.requestDeletion(tenantA, contactA, {
			actorId: null,
			actorDisplayName: 'Operator A'
		});

		expect(result.status).toBe('applied');
		expect(result.anonymized_at).toBeTruthy();
		expect(result.subject_contact_id).toBe(contactA);

		const stillThere = await withTenantSession(tenantA, async (tdb) => {
			const [c] = await tdb.select().from(contacts).where(eq(contacts.id, contactA)).limit(1);
			const [t] = await tdb
				.select()
				.from(transactions)
				.where(eq(transactions.id, txA))
				.limit(1);
			return { contact: c, tx: t };
		});

		expect(stillThere.contact).toBeTruthy();
		expect(stillThere.contact!.email).not.toBe(beforeEmail);
		expect(stillThere.contact!.email).toBeNull();
		expect(stillThere.contact!.firstName).toBe('Anonymized');
		expect(stillThere.contact!.displayName).toBe('Anonymized Contact');
		expect(stillThere.contact!.phone).toBeNull();
		expect(stillThere.contact!.deletedAt).toBeNull();

		expect(stillThere.tx).toBeTruthy();
		expect(stillThere.tx!.contactId).toBe(contactA);
		expect(stillThere.tx!.amount).toBe(10000);
		expect(stillThere.tx!.contactDisplayName).toBe('Anonymized Contact');

		const [reqRow] = await withTenantSession(tenantA, (tdb) =>
			tdb
				.select()
				.from(contactDataDeletionRequests)
				.where(eq(contactDataDeletionRequests.id, result.id))
		);
		expect(reqRow).toBeTruthy();
		expect(reqRow!.status).toBe('applied');

		const again = await service.requestDeletion(tenantA, contactA, {
			actorId: null,
			actorDisplayName: 'Operator A'
		});
		expect(again.id).toBe(result.id);
	});

	it('Tenant B negative: cannot export Tenant A contact under Tenant B context', async () => {
		await expect(service.exportData(tenantB, contactA)).rejects.toBeInstanceOf(NotFoundException);
	});

	it('Tenant B negative: cannot delete-request Tenant A contact', async () => {
		await expect(
			service.requestDeletion(tenantB, contactA, {
				actorId: null,
				actorDisplayName: 'Operator B'
			})
		).rejects.toBeInstanceOf(NotFoundException);
	});
});
