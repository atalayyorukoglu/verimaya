import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { ContactsService } from '../contacts/contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * AUDIT-01 (Faz 8) — patient file-label timezone leak isolation spec.
 *
 * Opus denetimi §[CRITICAL]: `ContactsService.getTenantTimezone(db)` was reading
 * `tenants` (no RLS) without `where(eq(tenants.id, tenantId))`, so within a `withTenant(T2, ...)`
 * scope the helper could return T1's timezone if T1 was scanned first. We provision
 * two tenants with different timezones, drive a file creation in each, and assert
 * the resulting `appointment_label` reflects the correct tenant's timezone.
 *
 * Without the fix, both tenants would see the same timezone (whichever row the DB
 * scanned first), making a daily reconciliation run by a non-Istanbul tenant return
 * the wrong day boundary. After the fix, the labels are tenant-specific.
 */
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
		await tx.execute(
			drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`
		);
		return fn(tx as TenantDb);
	});
}

describe('AUDIT-01: patient file-label uses the correct tenant timezone (Opus §[CRITICAL])', () => {
	const tenantIstanbul = randomUUID();
	const tenantLondon = randomUUID();
	let labelIstanbul: string | null = null;
	let labelLondon: string | null = null;

	// UTC 22:30 on 2026-08-01:
	//  - Europe/Istanbul (UTC+3) → 2026-08-02 01:30 local → "2026-08-02"
	//  - Europe/London  (UTC+1)  → 2026-08-01 23:30 local → "2026-08-01"
	const startsAt = new Date('2026-08-01T22:30:00Z');
	const testUserId = randomUUID();

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		// The `files.uploaded_by_user_id` FK requires a real `user` row. Provision one.
		await sql`insert into "user" (id, name, email) values (${testUserId}, 'audit-01', ${`audit-01-${testUserId}@test.local`})`;

		for (const [tenantId, timezone] of [
			[tenantIstanbul, 'Europe/Istanbul'],
			[tenantLondon, 'Europe/London']
		] as Array<[string, string]>) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, 'AUDIT-01 Test', ${`audit-01-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug, timezone)
				values (${tenantId}, 'AUDIT-01 Test', ${`audit-01-${tenantId.slice(0, 8)}`}, ${timezone})
			`;

			// Create a patient and an appointment for this tenant so the file upload has
			// something to attach to. We do this through service methods so the same code
			// paths run as production.
			const storage = new LocalFileStorage();
			const tenantContext = new TenantContextService({ client: db, sql } as unknown as never);
			const svc = new ContactsService(
				tenantContext,
				storage as unknown as Parameters<typeof ContactsService>[1]
			);

			await withTenantSession(tenantId, async (tdb) => {
				const hastaRows = await sql.begin(async (tx) => {
					await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
					return tx`
						insert into contact_types (tenant_id, name, sort_order)
						values (${tenantId}, 'Hasta', 0)
						on conflict (tenant_id, name) do update set name = excluded.name
						returning id
					`;
				});
				const hastaTypeId = hastaRows[0]!.id as string;
				const patient = await svc.createWithDb(tdb, tenantId, {
					contact_type_id: hastaTypeId,
					first_name: `Patient ${tenantId.slice(0, 6)}`,
					status: 'scheduled'
				});
				const appt = await tdb
					.insert((await import('../db/schema/appointments')).appointments)
					.values({
						tenantId,
						contactId: patient.id,
						contactDisplayName: patient.display_name,
						title: 'audit-01 appointment',
						startsAt,
						createdAt: startsAt,
						updatedAt: startsAt
					})
					.returning();
				await svc.createFileWithDb(
					tdb,
					tenantId,
					patient.id,
					{
						filename: 'x.pdf',
						mime_type: 'application/pdf',
						size_bytes: 10,
						appointment_id: appt[0]!.id
					},
					{ userId: testUserId, displayName: 'test' }
				);
			});

			// Read the resulting file row's appointment_label back from the DB so we don't
			// depend on whatever the service mapper returns.
			await withTenantSession(tenantId, async (tdb) => {
				const { sql } = getDb(databaseUrl);
				const rows = await sql.begin(async (tx) => {
					await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
					return tx`
						select appointment_label
						from files
						where tenant_id = ${tenantId}
						order by created_at desc
						limit 1
					`;
				});
				const label = rows[0]?.appointment_label ?? null;
				if (tenantId === tenantIstanbul) {
					labelIstanbul = label;
				} else {
					labelLondon = label;
				}
			});
		}
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantIstanbul, tenantLondon]);
		await sql`delete from "user" where id = ${testUserId}`;
		await closeDb();
	});

	it('Istanbul tenant sees date 2026-08-02 in the appointment label', () => {
		expect(labelIstanbul).toMatch(/2026-08-02/);
	});

	it('London tenant sees date 2026-08-01 in the appointment label (NOT 2026-08-02)', () => {
		// The bug: with no `where` filter on `tenants`, London would see Istanbul's
		// timezone (or vice versa, non-deterministically) and label 2026-08-02.
		expect(labelLondon).toMatch(/2026-08-01/);
		expect(labelLondon).not.toMatch(/2026-08-02/);
	});

	it('two tenants with different timezones produce DIFFERENT day labels for the same UTC instant', () => {
		expect(labelIstanbul).not.toBe(labelLondon);
	});
});