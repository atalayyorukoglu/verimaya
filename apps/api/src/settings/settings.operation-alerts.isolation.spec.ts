import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { UnprocessableEntityException } from '@nestjs/common';
import {
	cloneOperationAlertThresholds,
	defaultOperationAlertThresholds,
	operationAlertDueAt
} from '@verimaya/shared';
import { CryptoService } from '../common/crypto.service';
import { closeDb, getDb } from '../db/client';
import { ContactsService } from '../contacts/contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { AppointmentsService } from '../appointments/appointments.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { OperationAlertsService } from '../operation-alerts/operation-alerts.service';
import { SettingsService } from './settings.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(tenantId: string, fn: (tdb: TenantDb) => Promise<T>): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
		return fn(tx as TenantDb);
	});
}

function hoursFromNow(hours: number): string {
	return new Date(Date.now() + hours * 3_600_000).toISOString();
}

describe('operasyon alarmı ayarları izolasyonu (AI-04b)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const actorA = { actorId: randomUUID(), actorDisplayName: 'Owner A' };
	let contactTypeA: string;
	let contactTypeB: string;
	let patientA: string;
	let patientB: string;
	let settings: SettingsService;
	let operationAlertsService: OperationAlertsService;
	let appointmentsService: AppointmentsService;
	let contactsService: ContactsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, (tdb) => fn({ db: tdb }))
		} as TenantContextService;

		operationAlertsService = new OperationAlertsService(tenantContext);
		settings = new SettingsService(tenantContext, new CryptoService(), operationAlertsService);
		appointmentsService = new AppointmentsService(tenantContext, operationAlertsService);
		contactsService = new ContactsService(tenantContext, new LocalFileStorage());

		await sql`
			insert into "user" (id, name, email)
			values (${actorA.actorId}, 'Owner A', ${`oa-owner-${actorA.actorId.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Alerts A', ${`oa-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Alerts B', ${`oa-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Alerts A', ${`oa-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Alerts B', ${`oa-b-${tenantB.slice(0, 8)}`})
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
	}, 60_000);

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await sql`delete from "user" where id = ${actorA.actorId}`;
		await closeDb();
	});

	async function createAppointment(tenantId: string, contactId: string, startsInHours: number) {
		return withTenantSession(tenantId, async (tdb) => {
			const a = await appointmentsService.createWithDb(tdb, tenantId, {
				contact_id: contactId,
				starts_at: hoursFromNow(startsInHours),
				ends_at: null,
				title: 'Op',
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
			return a;
		});
	}

	it('doldurulmamış ayar varsayılan ve is_default döner', async () => {
		const res = await settings.getOperationAlerts(tenantA);
		expect(res.is_default).toBe(true);
		expect(res.thresholds).toEqual(defaultOperationAlertThresholds());
	});

	it('tenant B, tenant A ayarını okuyamaz / üzerine yazamaz', async () => {
		const custom = cloneOperationAlertThresholds(defaultOperationAlertThresholds());
		custom.flight.hours = 24;
		await settings.saveOperationAlerts(tenantA, { thresholds: custom }, actorA);

		const a = await settings.getOperationAlerts(tenantA);
		expect(a.is_default).toBe(false);
		expect(a.thresholds.flight.hours).toBe(24);

		const b = await settings.getOperationAlerts(tenantB);
		expect(b.is_default).toBe(true);
		expect(b.thresholds.flight.hours).toBe(48);

		const bCustom = cloneOperationAlertThresholds(defaultOperationAlertThresholds());
		bCustom.transfer.hours = 6;
		await settings.saveOperationAlerts(tenantB, { thresholds: bCustom }, actorA);

		const aAfter = await settings.getOperationAlerts(tenantA);
		expect(aAfter.thresholds.flight.hours).toBe(24);
		expect(aAfter.thresholds.transfer.hours).toBe(24);
	});

	it('eşik düşünce teyitsiz due_at kayar; teyitli satır hiç değişmez', async () => {
		const appointment = await createAppointment(tenantA, patientA, 100);
		const before = await operationAlertsService.list(tenantA, { limit: 50 });
		const flight = before.items.find(
			(item) => item.appointment_id === appointment.id && item.kind === 'flight'
		)!;
		const transfer = before.items.find(
			(item) => item.appointment_id === appointment.id && item.kind === 'transfer'
		)!;

		const confirmed = await withTenantSession(tenantA, (tdb) =>
			operationAlertsService.confirmWithDb(tdb, flight.id, {
				actorId: actorA.actorId,
				actorDisplayName: 'Agent A'
			})
		);

		const next = cloneOperationAlertThresholds(
			(await settings.getOperationAlerts(tenantA)).thresholds
		);
		next.flight.hours = 12;
		next.transfer.hours = 6;
		await settings.saveOperationAlerts(tenantA, { thresholds: next }, actorA);

		const after = await operationAlertsService.list(tenantA, { limit: 50 });
		const flightAfter = after.items.find((item) => item.id === flight.id)!;
		const transferAfter = after.items.find((item) => item.id === transfer.id)!;

		expect(flightAfter.due_at).toBe(confirmed.due_at);
		expect(flightAfter.threshold_hours).toBe(confirmed.threshold_hours);
		expect(flightAfter.confirmed_at).toBe(confirmed.confirmed_at);
		expect(flightAfter.confirmed_by).toBe(confirmed.confirmed_by);

		const expectedTransferDue = operationAlertDueAt(new Date(appointment.starts_at), 6).toISOString();
		expect(transferAfter.due_at).toBe(expectedTransferDue);
		expect(transferAfter.threshold_hours).toBe(6);
		expect(transferAfter.confirmed_at).toBeNull();
	});

	it('tür kapatılınca teyitsizler listeden düşer, teyitlisi kalır', async () => {
		const appointment = await createAppointment(tenantA, patientA, 80);
		const before = await operationAlertsService.list(tenantA, { limit: 50 });
		const welcome = before.items.find(
			(item) => item.appointment_id === appointment.id && item.kind === 'welcome'
		)!;
		const clinic = before.items.find(
			(item) => item.appointment_id === appointment.id && item.kind === 'clinic'
		)!;

		await withTenantSession(tenantA, (tdb) =>
			operationAlertsService.confirmWithDb(tdb, clinic.id, {
				actorId: actorA.actorId,
				actorDisplayName: 'Agent A'
			})
		);

		const next = cloneOperationAlertThresholds(
			(await settings.getOperationAlerts(tenantA)).thresholds
		);
		next.welcome.enabled = false;
		next.clinic.enabled = false;
		await settings.saveOperationAlerts(tenantA, { thresholds: next }, actorA);

		const after = await operationAlertsService.list(tenantA, { limit: 50 });
		expect(
			after.items.some((item) => item.appointment_id === appointment.id && item.kind === 'welcome')
		).toBe(false);
		const clinicAfter = after.items.find(
			(item) => item.appointment_id === appointment.id && item.kind === 'clinic'
		);
		expect(clinicAfter).toBeDefined();
		expect(clinicAfter!.confirmed_at).toBeTruthy();
		expect(clinicAfter!.id).toBe(clinic.id);
		expect(welcome.id).toBeTruthy();
	});

	it('kapalı türde yeni randevu o türü açmaz, açık türleri açar', async () => {
		const next = cloneOperationAlertThresholds(defaultOperationAlertThresholds());
		next.welcome.enabled = false;
		await settings.saveOperationAlerts(tenantA, { thresholds: next }, actorA);

		const appointment = await createAppointment(tenantA, patientA, 90);
		const page = await operationAlertsService.list(tenantA, { limit: 50 });
		const kinds = page.items
			.filter((item) => item.appointment_id === appointment.id)
			.map((item) => item.kind)
			.sort();
		expect(kinds).toEqual(['clinic', 'flight', 'transfer']);
	});

	it('kapalı türde POST 422 döner', async () => {
		const disabled = cloneOperationAlertThresholds(defaultOperationAlertThresholds());
		disabled.welcome.enabled = false;
		await settings.saveOperationAlerts(tenantB, { thresholds: disabled }, actorA);

		const appointment = await createAppointment(tenantB, patientB, 90);
		await expect(
			withTenantSession(tenantB, (tdb) =>
				operationAlertsService.createWithDb(tdb, tenantB, {
					appointment_id: appointment.id,
					kind: 'welcome'
				})
			)
		).rejects.toBeInstanceOf(UnprocessableEntityException);
	});

	it('tür yeniden açılınca eski randevulara alarm üretilmez', async () => {
		const disabled = cloneOperationAlertThresholds(defaultOperationAlertThresholds());
		disabled.welcome.enabled = false;
		await settings.saveOperationAlerts(tenantA, { thresholds: disabled }, actorA);

		const appointment = await createAppointment(tenantA, patientA, 70);
		const before = await operationAlertsService.list(tenantA, { limit: 50 });
		expect(
			before.items.some((item) => item.appointment_id === appointment.id && item.kind === 'welcome')
		).toBe(false);

		const enabled = cloneOperationAlertThresholds(disabled);
		enabled.welcome.enabled = true;
		await settings.saveOperationAlerts(tenantA, { thresholds: enabled }, actorA);

		const after = await operationAlertsService.list(tenantA, { limit: 50 });
		expect(
			after.items.some((item) => item.appointment_id === appointment.id && item.kind === 'welcome')
		).toBe(false);
	});
});
