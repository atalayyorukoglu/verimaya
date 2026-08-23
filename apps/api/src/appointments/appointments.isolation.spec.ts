import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { ContactsService } from '../contacts/contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { AppointmentsService } from './appointments.service';
import { OperationAlertsService } from '../operation-alerts/operation-alerts.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * TEST-01 (Faz 2.4): appointments tenant isolation. Same template as
 * `webhook-subscriptions.isolation.spec.ts` — services instantiated directly with a faked
 * `TenantContextService` so real Postgres RLS (`SET LOCAL app.current_tenant_id`) is what
 * actually does the blocking, not an app-level `where tenant_id = ...`.
 *
 * Needs a live Postgres (DATABASE_URL_APP) — see 0.3. Not runnable in this sandbox (no
 * docker); written and reasoned through, not executed.
 *
 * Scope note: `AppointmentsController` has no `GET /:id` or `DELETE` route, and
 * `AppointmentsService` has no `get()`/`remove()` — there is nothing to test for
 * get-by-id- or delete-isolation on this resource today (the plan doc's "list/get/update/
 * delete" is aspirational here). What's covered is what actually exists: list, cross-tenant
 * `contact_id` filter leakage, and update.
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

describe('appointments tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactTypeA: string;
	let contactTypeB: string;
	let patientA: string;
	let patientB: string;
	let appointmentA: string;
	let appointmentB: string;
	let appointmentsService: AppointmentsService;
	let contactsService: ContactsService;
	let db: TenantDb;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const dbHandle = getDb(databaseUrl);
		db = dbHandle.db;
		const { sql } = dbHandle;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, (tdb) => fn({ db: tdb }))
		} as TenantContextService;

		const operationAlertsService = new OperationAlertsService(tenantContext);
		appointmentsService = new AppointmentsService(tenantContext, operationAlertsService);
		contactsService = new ContactsService(tenantContext, new LocalFileStorage());

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`})
		`;

		contactTypeA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantA}, 'Hasta', 0)
				returning id
			`;
			return row!.id as string;
		});
		contactTypeB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantB}, 'Hasta', 0)
				returning id
			`;
			return row!.id as string;
		});

		patientA = await withTenantSession(tenantA, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Patient A'
			});
			return p.id;
		});
		patientB = await withTenantSession(tenantB, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantB, {
				contact_type_id: contactTypeB,
				first_name: 'Patient B'
			});
			return p.id;
		});

		appointmentA = await withTenantSession(tenantA, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				starts_at: new Date().toISOString(),
				ends_at: null,
				title: 'Appointment A',
				appointment_type: null,
				status: 'scheduled',
				clinic_name: null,
				hotel_name: null,
				transfer_note: null,
				clinic_contact_id: null,
				hotel_contact_id: null,
				transfer_contact_id: null,
				notes: null
			});
			return a.id;});
		appointmentB = await withTenantSession(tenantB, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantB, {
				contact_id: patientB,
				starts_at: new Date().toISOString(),
				ends_at: null,
				title: 'Appointment B',
				appointment_type: null,
				status: 'scheduled',
				clinic_name: null,
				hotel_name: null,
				transfer_note: null,
				clinic_contact_id: null,
				hotel_contact_id: null,
				transfer_contact_id: null,
				notes: null
			});
			return a.id;});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant A lists only its own appointment', async () => {
		const result = await appointmentsService.list(tenantA, { limit: 25 });
		expect(result.items.map((a) => a.id)).toEqual([appointmentA]);
		expect(result.items.some((a) => a.id === appointmentB)).toBe(false);
	});

	it('Tenant B lists only its own appointment', async () => {
		const result = await appointmentsService.list(tenantB, { limit: 25 });
		expect(result.items.map((a) => a.id)).toEqual([appointmentB]);
		expect(result.items.some((a) => a.id === appointmentA)).toBe(false);
	});

	it("Tenant A's contact_id filter using Tenant B's patient does not leak Tenant B's appointment", async () => {
		const result = await appointmentsService.list(tenantA, { limit: 25, contact_id: patientB });
		expect(result.items).toHaveLength(0);
	});

	it('G-05r: contact_involves matches patient / clinic / hotel / transfer role FKs', async () => {
		const clinicId = await withTenantSession(tenantA, async (tdb) => {
			const c = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Clinic Involves'
			});
			return c.id;
		});
		const hotelId = await withTenantSession(tenantA, async (tdb) => {
			const c = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Hotel Involves'
			});
			return c.id;
		});
		const transferId = await withTenantSession(tenantA, async (tdb) => {
			const c = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Transfer Involves'
			});
			return c.id;
		});

		const asClinic = await withTenantSession(tenantA, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				starts_at: new Date().toISOString(),
				ends_at: null,
				title: 'Clinic role visit',
				appointment_type: null,
				status: 'scheduled',
				clinic_name: null,
				hotel_name: null,
				transfer_note: null,
				clinic_contact_id: clinicId,
				hotel_contact_id: null,
				transfer_contact_id: null,
				notes: null
			});
			return a.id;
		});
		const asHotel = await withTenantSession(tenantA, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				starts_at: new Date().toISOString(),
				ends_at: null,
				title: 'Hotel role visit',
				appointment_type: null,
				status: 'scheduled',
				clinic_name: null,
				hotel_name: null,
				transfer_note: null,
				clinic_contact_id: null,
				hotel_contact_id: hotelId,
				transfer_contact_id: null,
				notes: null
			});
			return a.id;
		});
		const asTransfer = await withTenantSession(tenantA, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				starts_at: new Date().toISOString(),
				ends_at: null,
				title: 'Transfer role visit',
				appointment_type: null,
				status: 'scheduled',
				clinic_name: null,
				hotel_name: null,
				transfer_note: null,
				clinic_contact_id: null,
				hotel_contact_id: null,
				transfer_contact_id: transferId,
				notes: null
			});
			return a.id;
		});

		const byClinic = await appointmentsService.list(tenantA, {
			limit: 25,
			contact_involves: clinicId
		});
		expect(byClinic.items.map((a) => a.id)).toEqual([asClinic]);

		const byHotel = await appointmentsService.list(tenantA, {
			limit: 25,
			contact_involves: hotelId
		});
		expect(byHotel.items.map((a) => a.id)).toEqual([asHotel]);

		const byTransfer = await appointmentsService.list(tenantA, {
			limit: 25,
			contact_involves: transferId
		});
		expect(byTransfer.items.map((a) => a.id)).toEqual([asTransfer]);

		const byPatient = await appointmentsService.list(tenantA, {
			limit: 50,
			contact_involves: patientA
		});
		const patientIds = byPatient.items.map((a) => a.id);
		expect(patientIds).toContain(appointmentA);
		expect(patientIds).toContain(asClinic);
		expect(patientIds).toContain(asHotel);
		expect(patientIds).toContain(asTransfer);
	});

	it("G-05r: Tenant A contact_involves with Tenant B contact does not leak", async () => {
		const result = await appointmentsService.list(tenantA, {
			limit: 25,
			contact_involves: patientB
		});
		expect(result.items).toHaveLength(0);
	});

	it('hekim alanı: doctor_contact_id nullable — eski/hekimsiz randevu bozulmadan çalışır', async () => {
		const noDoctorId = await withTenantSession(tenantA, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				starts_at: new Date().toISOString(),
				ends_at: null,
				title: 'Doctorless visit',
				appointment_type: null,
				status: 'scheduled',
				clinic_name: null,
				hotel_name: null,
				transfer_note: null,
				clinic_contact_id: null,
				hotel_contact_id: null,
				transfer_contact_id: null,
				notes: null
			});
			return a.id;
		});
		const found = (await appointmentsService.list(tenantA, { limit: 100 })).items.find(
			(a) => a.id === noDoctorId
		);
		expect(found?.doctor_contact_id ?? null).toBeNull();
	});

	it('hekim alanı: contact_involves hekim rolündeki FK ile de eşleşir', async () => {
		const doctorId = await withTenantSession(tenantA, async (tdb) => {
			const c = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Doctor Involves'
			});
			return c.id;
		});
		const asDoctor = await withTenantSession(tenantA, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				starts_at: new Date().toISOString(),
				ends_at: null,
				title: 'Doctor role visit',
				appointment_type: null,
				status: 'scheduled',
				clinic_name: null,
				hotel_name: null,
				transfer_note: null,
				clinic_contact_id: null,
				hotel_contact_id: null,
				transfer_contact_id: null,
				doctor_contact_id: doctorId,
				notes: null
			});
			return a.id;
		});

		const byDoctor = await appointmentsService.list(tenantA, {
			limit: 25,
			contact_involves: doctorId
		});
		expect(byDoctor.items.map((a) => a.id)).toEqual([asDoctor]);

		const crossTenant = await appointmentsService.list(tenantB, {
			limit: 25,
			contact_involves: doctorId
		});
		expect(crossTenant.items).toHaveLength(0);
	});

	it('hekim alanı: hekim kişisi silinince (hard delete) randevu düşmez, doctor_contact_id null olur (ON DELETE SET NULL)', async () => {
		const doctorId = await withTenantSession(tenantA, async (tdb) => {
			const c = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Doctor To Delete'
			});
			return c.id;
		});
		const apptId = await withTenantSession(tenantA, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				starts_at: new Date().toISOString(),
				ends_at: null,
				title: 'Visit with doctor to be deleted',
				appointment_type: null,
				status: 'scheduled',
				clinic_name: null,
				hotel_name: null,
				transfer_note: null,
				clinic_contact_id: null,
				hotel_contact_id: null,
				transfer_contact_id: null,
				doctor_contact_id: doctorId,
				notes: null
			});
			return a.id;
		});

		await withTenantSession(tenantA, async (tdb) => {
			await tdb.execute(drizzleSql`delete from contacts where id = ${doctorId}`);
		});

		const found = (await appointmentsService.list(tenantA, { limit: 100 })).items.find(
			(a) => a.id === apptId
		);
		expect(found).toBeDefined();
		expect(found?.doctor_contact_id ?? null).toBeNull();
	});

	it('Tenant A cannot update Tenant B appointment', async () => {
		await withTenantSession(tenantA, async (tdb) => {
			await expect(
				appointmentsService.updateWithDb(tdb, appointmentB, { title: 'Hacked by A' })
			).rejects.toBeInstanceOf(NotFoundException);});

		const stillB = await appointmentsService.list(tenantB, { limit: 25 });
		expect(stillB.items.find((a) => a.id === appointmentB)?.title).toBe('Appointment B');
	});

	it("GAP-04: status='no_show' returns only matching appointments", async () => {
		const noShowId = await withTenantSession(tenantA, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				starts_at: new Date().toISOString(),
				ends_at: null,
				title: 'No-show slot',
				appointment_type: null,
				status: 'no_show',
				clinic_name: null,
				hotel_name: null,
				transfer_note: null,
				clinic_contact_id: null,
				hotel_contact_id: null,
				transfer_contact_id: null,
				notes: null
			});
			return a.id;});

		const byStatus = await appointmentsService.list(tenantA, { limit: 25, status: 'no_show' });
		expect(byStatus.items.every((a) => a.status === 'no_show')).toBe(true);
		expect(byStatus.items.map((a) => a.id)).toEqual([noShowId]);
		expect(byStatus.items.map((a) => a.id)).not.toContain(appointmentA);
	});

	it('GAP-04: q matches patient display name substring only', async () => {
		const searchablePatientId = await withTenantSession(tenantA, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Zeynep UniqueGap04'
			});
			return p.id;});
		const matchId = await withTenantSession(tenantA, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantA, {
				contact_id: searchablePatientId,
				starts_at: new Date().toISOString(),
				ends_at: null,
				title: 'Searchable visit',
				appointment_type: null,
				status: 'confirmed',
				clinic_name: null,
				hotel_name: null,
				transfer_note: null,
				clinic_contact_id: null,
				hotel_contact_id: null,
				transfer_contact_id: null,
				notes: null
			});
			return a.id;});

		const byQ = await appointmentsService.list(tenantA, { limit: 25, q: 'UniqueGap04' });
		expect(byQ.items.map((a) => a.id)).toEqual([matchId]);
		expect(byQ.items.map((a) => a.id)).not.toContain(appointmentA);
	});

	it('from/to narrow the result set to tenant-local calendar days', async () => {
		const inRangeId = await withTenantSession(tenantA, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				starts_at: '2026-04-15T10:00:00.000Z',
				ends_at: null,
				title: 'Mid-April visit',
				appointment_type: null,
				status: 'scheduled',
				clinic_name: null,
				hotel_name: null,
				transfer_note: null,
				clinic_contact_id: null,
				hotel_contact_id: null,
				transfer_contact_id: null,
				notes: null
			});
			return a.id;});
		const outOfRangeId = await withTenantSession(tenantA, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantA, {
				contact_id: patientA,
				starts_at: '2026-05-20T10:00:00.000Z',
				ends_at: null,
				title: 'May visit',
				appointment_type: null,
				status: 'scheduled',
				clinic_name: null,
				hotel_name: null,
				transfer_note: null,
				clinic_contact_id: null,
				hotel_contact_id: null,
				transfer_contact_id: null,
				notes: null
			});
			return a.id;});

		const byRange = await appointmentsService.list(tenantA, {
			limit: 25,
			from: '2026-04-01',
			to: '2026-04-30'
		});
		expect(byRange.items.map((a) => a.id)).toContain(inRangeId);
		expect(byRange.items.map((a) => a.id)).not.toContain(outOfRangeId);
		expect(byRange.items.map((a) => a.id)).not.toContain(appointmentA);
	});

	it('GAP-F09-21: type_counts/status_counts over filtered set; cursor and soft-delete ignored', async () => {
		const marker = `GapF0921-${randomUUID().slice(0, 8)}`;
		const seedPatientId = await withTenantSession(tenantA, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: `${marker} Patient`
			});
			return p.id;});

		const created = await withTenantSession(tenantA, async (tdb) => {
			const specs = [
				{ appointment_type: 'Saç ekimi', status: 'scheduled' as const },
				{ appointment_type: 'Saç ekimi', status: 'completed' as const },
				{ appointment_type: 'Diş', status: 'confirmed' as const },
				{ appointment_type: null, status: 'no_show' as const }
			];
			const ids: string[] = [];
			for (const spec of specs) {
				const a = await appointmentsService.createWithDb(tdb, tenantA, {
					contact_id: seedPatientId,
					starts_at: new Date().toISOString(),
					ends_at: null,
					title: `${marker} visit`,
					appointment_type: spec.appointment_type,
					status: spec.status,
					clinic_name: null,
					hotel_name: null,
					transfer_note: null,
					clinic_contact_id: null,
					hotel_contact_id: null,
					transfer_contact_id: null,
					notes: `${marker} notes`
				});
				ids.push(a.id);
			}
			return ids;});

		const softDeletedId = created[3]!;
		await withTenantSession(tenantA, async (tdb) => {
			await appointmentsService.softDeleteWithDb(tdb, tenantA, softDeletedId, {
				actorId: null,
				actorDisplayName: 'gap-f09-21'
			});});

		const byQ = await appointmentsService.list(tenantA, { limit: 25, q: marker });
		expect(byQ.items).toHaveLength(3);
		expect(byQ.type_counts).toEqual({ 'Saç ekimi': 2, Diş: 1 });
		expect(byQ.status_counts).toEqual({
			scheduled: 1,
			completed: 1,
			confirmed: 1
		});

		const page1 = await appointmentsService.list(tenantA, { limit: 1, q: marker });
		expect(page1.items).toHaveLength(1);
		expect(page1.next_cursor).toBeTruthy();
		expect(page1.type_counts).toEqual(byQ.type_counts);
		expect(page1.status_counts).toEqual(byQ.status_counts);

		const page2 = await appointmentsService.list(tenantA, {
			limit: 1,
			q: marker,
			cursor: page1.next_cursor!
		});
		expect(page2.type_counts).toEqual(byQ.type_counts);
		expect(page2.status_counts).toEqual(byQ.status_counts);
	});

	it("GAP-F09-21: Tenant B aggregates exclude Tenant A's appointments", async () => {
		const listB = await appointmentsService.list(tenantB, { limit: 25 });
		expect(listB.items.map((a) => a.id)).toEqual([appointmentB]);
		expect(listB.status_counts).toEqual({ scheduled: 1 });
		expect(listB.type_counts).toEqual({ '': 1 });

		const listA = await appointmentsService.list(tenantA, { limit: 100 });
		const tenantATotal = Object.values(listA.status_counts).reduce((s, n) => s + n, 0);
		expect(tenantATotal).toBeGreaterThan(1);
		expect(listB.status_counts.scheduled).toBe(1);
		expect(listA.items.some((a) => a.id === appointmentB)).toBe(false);
	});

	it('G-29: derives contact_info_incomplete on create and list without cross-tenant leakage', async () => {
		const marker = `G29-${randomUUID().slice(0, 8)}`;
		const [completeContactId, incompleteContactId, phoneOnlyContactId] = await withTenantSession(
			tenantA,
			async (tdb) => {
				const completeContact = await contactsService.createWithDb(tdb, tenantA, {
					contact_type_id: contactTypeA,
					first_name: `${marker} Complete`,
					phone: '+905551112233',
					email: 'complete@g29.test'
				});
				const incompleteContact = await contactsService.createWithDb(tdb, tenantA, {
					contact_type_id: contactTypeA,
					first_name: `${marker} Incomplete`,
					phone: null,
					email: null
				});
				const phoneOnlyContact = await contactsService.createWithDb(tdb, tenantA, {
					contact_type_id: contactTypeA,
					first_name: `${marker} Phone only`,
					phone: '+905554445566',
					email: null
				});
				return [completeContact.id, incompleteContact.id, phoneOnlyContact.id];
			}
		);

		const createAppointment = async (contactId: string, title: string) =>
			withTenantSession(tenantA, async (tdb) =>
				appointmentsService.createWithDb(tdb, tenantA, {
					contact_id: contactId,
					starts_at: new Date().toISOString(),
					ends_at: null,
					title,
					appointment_type: null,
					status: 'scheduled',
					clinic_name: null,
					hotel_name: null,
					transfer_note: null,
					clinic_contact_id: null,
					hotel_contact_id: null,
					transfer_contact_id: null,
					notes: null
				})
			);

		const [complete, incomplete, phoneOnly] = await Promise.all([
			createAppointment(completeContactId, `${marker} complete`),
			createAppointment(incompleteContactId, `${marker} incomplete`),
			createAppointment(phoneOnlyContactId, `${marker} phone-only`)
		]);

		expect(complete.contact_info_incomplete).toBe(false);
		expect(incomplete.contact_info_incomplete).toBe(true);
		expect(phoneOnly.contact_info_incomplete).toBe(false);

		const listA = await appointmentsService.list(tenantA, { limit: 25, q: marker });
		expect(listA.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: complete.id, contact_info_incomplete: false }),
				expect.objectContaining({ id: incomplete.id, contact_info_incomplete: true }),
				expect.objectContaining({ id: phoneOnly.id, contact_info_incomplete: false })
			])
		);

		const listB = await appointmentsService.list(tenantB, { limit: 25 });
		expect(listB.items.some((appointment) => appointment.id === incomplete.id)).toBe(false);
	});
});
