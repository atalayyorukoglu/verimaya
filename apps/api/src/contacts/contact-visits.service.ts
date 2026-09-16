import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type {
	ContactVisit,
	ContactVisitCreate,
	ContactVisitHotelCoveredBy,
	ContactVisitStatus,
	ContactVisitType,
	ContactVisitUpdate
} from '@verimaya/shared';
import { contacts } from '../db/schema/contacts';
import { contactVisits, type ContactVisitRow } from '../db/schema/contact-visits';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

/** DB satırı → API gövdesi. Öneri servisi de aynı dönüştürücüyü kullanır. */
export function toContactVisit(row: ContactVisitRow): ContactVisit {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		contact_id: row.contactId,
		visit_type: row.visitType as ContactVisitType,
		sequence: row.sequence,
		arrival_at: row.arrivalAt ? row.arrivalAt.toISOString() : null,
		arrival_time_known: row.arrivalTimeKnown,
		departure_at: row.departureAt ? row.departureAt.toISOString() : null,
		departure_time_known: row.departureTimeKnown,
		arrival_flight: row.arrivalFlight,
		departure_flight: row.departureFlight,
		hotel: row.hotel,
		hotel_covered_by: row.hotelCoveredBy as ContactVisitHotelCoveredBy,
		transfer_provider: row.transferProvider,
		clinic: row.clinic,
		doctor: row.doctor,
		treatment_plan: row.treatmentPlan,
		status: row.status as ContactVisitStatus,
		notes: row.notes,
		source_inbound_message_id: row.sourceInboundMessageId,
		created_by: row.createdBy,
		created_at: row.createdAt.toISOString(),
		updated_at: row.updatedAt.toISOString()
	};
}

/** `undefined` alana dokunmaz, `null` alanı boşaltır. */
function metin(value: string | null | undefined): string | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	const t = value.trim();
	return t.length > 0 ? t : null;
}

function zaman(value: string | null | undefined): Date | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * VIZIT-01 — kişi vizitleri. Sıralama geliş tarihine göre (tarihsiz vizitler
 * sona): kart "önce ne oldu, sonra ne oldu" diye okunsun.
 */
@Injectable()
export class ContactVisitsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string, contactId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => ({
			items: await this.listWithDb(db, contactId, { ensureContact: true })
		}));
	}

	/**
	 * Açık bir işlem içinde okuma — kişi özeti ve öneri onayı bunu kullanır.
	 * `ensureContact` yalnız uçlarda gerekli; özet zaten kişiyi okumuş oluyor.
	 */
	async listWithDb(
		db: TenantDb,
		contactId: string,
		opts: { ensureContact?: boolean } = {}
	): Promise<ContactVisit[]> {
		if (opts.ensureContact) await this.kisiVarMi(db, contactId);
		const rows = await db
			.select()
			.from(contactVisits)
			.where(and(eq(contactVisits.contactId, contactId), isNull(contactVisits.deletedAt)))
			.orderBy(asc(contactVisits.arrivalAt), asc(contactVisits.createdAt));
		return rows.map(toContactVisit);
	}

	async createWithDb(
		db: TenantDb,
		tenantId: string,
		contactId: string,
		input: ContactVisitCreate,
		actor: { displayName?: string | null }
	): Promise<ContactVisit> {
		await this.kisiVarMi(db, contactId);

		const [row] = await db
			.insert(contactVisits)
			.values({
				tenantId,
				contactId,
				visitType: input.visit_type,
				sequence: input.sequence ?? null,
				arrivalAt: zaman(input.arrival_at) ?? null,
				arrivalTimeKnown: input.arrival_time_known ?? true,
				departureAt: zaman(input.departure_at) ?? null,
				departureTimeKnown: input.departure_time_known ?? true,
				arrivalFlight: metin(input.arrival_flight) ?? null,
				departureFlight: metin(input.departure_flight) ?? null,
				hotel: metin(input.hotel) ?? null,
				hotelCoveredBy: input.hotel_covered_by ?? 'unknown',
				transferProvider: metin(input.transfer_provider) ?? null,
				clinic: metin(input.clinic) ?? null,
				doctor: metin(input.doctor) ?? null,
				treatmentPlan: metin(input.treatment_plan) ?? null,
				status: input.status ?? 'planned',
				notes: metin(input.notes) ?? null,
				sourceInboundMessageId: input.source_inbound_message_id ?? null,
				createdBy: actor.displayName?.trim() || null
			})
			.returning();

		return toContactVisit(row!);
	}

	async updateWithDb(
		db: TenantDb,
		contactId: string,
		visitId: string,
		input: ContactVisitUpdate
	): Promise<ContactVisit> {
		await this.kisiVarMi(db, contactId);
		await this.vizitVarMi(db, contactId, visitId);

		const patch: Partial<typeof contactVisits.$inferInsert> = { updatedAt: new Date() };
		if (input.visit_type !== undefined) patch.visitType = input.visit_type;
		if (input.sequence !== undefined) patch.sequence = input.sequence;
		if (input.arrival_at !== undefined) patch.arrivalAt = zaman(input.arrival_at) ?? null;
		if (input.arrival_time_known !== undefined) patch.arrivalTimeKnown = input.arrival_time_known;
		if (input.departure_at !== undefined) patch.departureAt = zaman(input.departure_at) ?? null;
		if (input.departure_time_known !== undefined) {
			patch.departureTimeKnown = input.departure_time_known;
		}
		if (input.arrival_flight !== undefined) patch.arrivalFlight = metin(input.arrival_flight)!;
		if (input.departure_flight !== undefined) {
			patch.departureFlight = metin(input.departure_flight)!;
		}
		if (input.hotel !== undefined) patch.hotel = metin(input.hotel)!;
		if (input.hotel_covered_by !== undefined) patch.hotelCoveredBy = input.hotel_covered_by;
		if (input.transfer_provider !== undefined) {
			patch.transferProvider = metin(input.transfer_provider)!;
		}
		if (input.clinic !== undefined) patch.clinic = metin(input.clinic)!;
		if (input.doctor !== undefined) patch.doctor = metin(input.doctor)!;
		if (input.treatment_plan !== undefined) patch.treatmentPlan = metin(input.treatment_plan)!;
		if (input.status !== undefined) patch.status = input.status;
		if (input.notes !== undefined) patch.notes = metin(input.notes)!;

		const [row] = await db
			.update(contactVisits)
			.set(patch)
			.where(and(eq(contactVisits.id, visitId), eq(contactVisits.contactId, contactId)))
			.returning();

		return toContactVisit(row!);
	}

	/**
	 * Yumuşak silme: `deleted_at` yazılır **ve** durum `cancelled` olur. İki adım
	 * birden, çünkü listeden düşen vizit "hiç olmamış" değil "iptal edilmiş"tir;
	 * kayıt geri getirilirse durumu doğru okunsun.
	 */
	async softDeleteWithDb(db: TenantDb, contactId: string, visitId: string) {
		await this.kisiVarMi(db, contactId);
		await this.vizitVarMi(db, contactId, visitId);

		const now = new Date();
		const [row] = await db
			.update(contactVisits)
			.set({ deletedAt: now, status: 'cancelled', updatedAt: now })
			.where(and(eq(contactVisits.id, visitId), eq(contactVisits.contactId, contactId)))
			.returning({ id: contactVisits.id });

		return { id: row!.id, deleted: true as const };
	}

	private async kisiVarMi(db: TenantDb, contactId: string): Promise<void> {
		const [row] = await db
			.select({ id: contacts.id })
			.from(contacts)
			.where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
			.limit(1);
		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}
	}

	private async vizitVarMi(db: TenantDb, contactId: string, visitId: string): Promise<void> {
		const [row] = await db
			.select({ id: contactVisits.id })
			.from(contactVisits)
			.where(
				and(
					eq(contactVisits.id, visitId),
					eq(contactVisits.contactId, contactId),
					isNull(contactVisits.deletedAt)
				)
			)
			.limit(1);
		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact visit not found' }
			});
		}
	}
}
