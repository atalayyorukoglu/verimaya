import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, or } from 'drizzle-orm';
import type {
	PatientChecklist,
	PatientChecklistItemStatus,
	PatientChecklistStatus,
	PatientChecklistVisit,
	PatientFlow,
	PatientFlowChecklistItem
} from '@verimaya/shared';
import {
	PATIENT_CHECKLIST_UNKNOWN_VISIT_LABEL,
	PATIENT_FLOW_SETTING_KEY,
	contactVisitDateRangeLabel,
	contactVisitTypeLabels,
	defaultPatientFlow,
	patientFlowSchema
} from '@verimaya/shared';
import { contactVisits, type ContactVisitRow } from '../db/schema/contact-visits';
import { contacts } from '../db/schema/contacts';
import { inboundMessageContacts } from '../db/schema/inbound-message-contacts';
import { inboundMessageMedia } from '../db/schema/inbound-message-media';
import { tenantSettings } from '../db/schema/tenant-settings';
import { transactions } from '../db/schema/transactions';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

/**
 * EVRAK-01 — kontrol listesi kendini işaretler.
 *
 * Eskiden "eksik" listesini yalnız model yazıyordu: 80 mesajlık bağlamdan
 * "pasaport var mı" diye TAHMİN ediyordu ve yanılıyordu. Evrak sınıflandırması
 * (`inbound_message_media.doc_type`) ve vizit alanları sayılabilir veri olduğu için
 * artık madde durumu **hesaplanıyor**; model yalnız hesabın karar veremediği
 * yerlerde konuşuyor (bkz. `ContactSummaryService`).
 *
 * **Zaman kuralı** — madde "eksik" sayılmadan önce aşamasının gelmiş olması gerekir,
 * yoksa daha uçağa binmemiş hastaya "bitim evrakı eksik" deriz:
 *  - Vizit başlamadı (geliş ileride)        → her madde `na`.
 *  - Vizit sürüyor                          → kanıt varsa `done`, yoksa `na` (henüz vakti var).
 *  - Vizit kapandı (dönüş geçti / tamamlandı) → kanıt yoksa `missing`.
 *  - Hekim Onay pdf'i kapanıştan sonra 30 gün `na` kalır (belgede § 5: bazen 3 ay
 *    gecikmeli toplu geliyor, 30 günden önce sormak gürültü).
 *
 * **Vizitsiz kanıtlar** ayrı bir grupta toplanır ve orada madde asla `missing`
 * olmaz: ekin hangi vizite ait olduğunu bilmiyorsak eksik olduğunu da bilemeyiz.
 */

/** Kişi türü karşılaştırması — `contacts.contact_type_name` denormalize metindir. */
const PATIENT_TYPE_NAME = 'hasta';
/** Hekim onayı için tanınan gecikme payı. */
const DOCTOR_APPROVAL_GRACE_DAYS = 30;
const GUN_MS = 24 * 60 * 60 * 1000;
/** Kapanış: dönüş gününün sonuna kadar vizit "sürüyor" sayılır. */
const KAPANIS_PAYI_MS = GUN_MS;

type MediaKanit = { docType: string | null; visitId: string | null };
/**
 * PARA-01 — para kanıtı artık vizit bağını da taşıyor. `visitId` doluysa tarih
 * penceresine hiç bakılmaz: kullanıcının (ya da onay akışının) kurduğu bağ,
 * tarihten yapılan tahminden üstündür.
 */
type ParaKanit = {
	occurredOn: string;
	kind: string;
	visitId: string | null;
	currency: string | null;
	amount: number;
};

/** Vizitin zaman durumu — madde aşaması buna göre değerlendirilir. */
type VizitEvresi = 'not_started' | 'running' | 'closed';

export function vizitEvresi(
	visit: { arrivalAt: Date | null; departureAt: Date | null; status: string },
	now: Date
): VizitEvresi {
	if (visit.status === 'completed' || visit.status === 'cancelled') return 'closed';
	const t = now.getTime();
	const arrival = visit.arrivalAt?.getTime() ?? null;
	const departure = visit.departureAt?.getTime() ?? null;
	if (arrival !== null && t < arrival) return 'not_started';
	const end = departure ?? arrival;
	// Tarihsiz vizit: ne başladığını ne bittiğini bilmiyoruz — "sürüyor" say,
	// yani kanıtı say ama eksik deme.
	if (end === null) return 'running';
	return t > end + KAPANIS_PAYI_MS ? 'closed' : 'running';
}

@Injectable()
export class PatientChecklistService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async get(tenantId: string, contactId: string): Promise<PatientChecklist> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [contact] = await db
				.select({ id: contacts.id, contactTypeName: contacts.contactTypeName })
				.from(contacts)
				.where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
				.limit(1);
			if (!contact) {
				throw new NotFoundException({ error: { code: 'not_found', message: 'Contact not found' } });
			}
			return this.computeWithDb(db, contactId, contact.contactTypeName);
		});
	}

	/**
	 * Açık işlem içinde hesap — kişi özeti bunu kullanır (ikinci işlem açılmasın).
	 * Kişi türü Hasta değilse boş liste döner: kontrol listesi hasta akışına aittir.
	 */
	async computeWithDb(
		db: TenantDb,
		contactId: string,
		contactTypeName: string,
		now: Date = new Date()
	): Promise<PatientChecklist> {
		const isPatient = contactTypeName.trim().toLocaleLowerCase('tr') === PATIENT_TYPE_NAME;
		if (!isPatient) {
			return {
				contact_id: contactId,
				is_patient: false,
				visits: [],
				generated_at: now.toISOString()
			};
		}

		const flow = await this.hastaAkisiOku(db);
		const visits = await db
			.select()
			.from(contactVisits)
			.where(and(eq(contactVisits.contactId, contactId), isNull(contactVisits.deletedAt)))
			.orderBy(contactVisits.arrivalAt, contactVisits.createdAt);

		const medya = await this.medyaKanitlari(db, contactId);
		const para = await this.paraKanitlari(db, contactId);

		const out: PatientChecklistVisit[] = visits.map((v) =>
			this.vizitIcin(flow.checklist, v, medya, para, now)
		);

		// Hiçbir vizite bağlanamamış ekler ayrı grup: "Vizit belirsiz".
		const bagsiz = medya.filter((m) => m.visitId === null);
		if (bagsiz.length > 0 || visits.length === 0) {
			out.push({
				visit_id: null,
				visit_type: null,
				visit_label: PATIENT_CHECKLIST_UNKNOWN_VISIT_LABEL,
				arrival_at: null,
				items: flow.checklist.map((item) => this.bagsizMadde(item, bagsiz))
			});
		}

		return {
			contact_id: contactId,
			is_patient: true,
			visits: out,
			generated_at: now.toISOString()
		};
	}

	private vizitIcin(
		checklist: PatientFlowChecklistItem[],
		visit: ContactVisitRow,
		medya: MediaKanit[],
		para: ParaKanit[],
		now: Date
	): PatientChecklistVisit {
		const evre = vizitEvresi(visit, now);
		const label = [
			contactVisitTypeLabels[visit.visitType as keyof typeof contactVisitTypeLabels] ??
				visit.visitType,
			contactVisitDateRangeLabel({
				arrival_at: visit.arrivalAt ? visit.arrivalAt.toISOString() : null,
				arrival_time_known: visit.arrivalTimeKnown,
				departure_at: visit.departureAt ? visit.departureAt.toISOString() : null,
				departure_time_known: visit.departureTimeKnown
			})
		]
			.filter(Boolean)
			.join(' · ');

		const items = checklist.map((item) => this.madde(item, visit, evre, medya, para, now));
		return {
			visit_id: visit.id,
			visit_type: visit.visitType as PatientChecklistVisit['visit_type'],
			visit_label: label.slice(0, 200),
			arrival_at: visit.arrivalAt ? visit.arrivalAt.toISOString() : null,
			items
		};
	}

	private madde(
		item: PatientFlowChecklistItem,
		visit: ContactVisitRow,
		evre: VizitEvresi,
		medya: MediaKanit[],
		para: ParaKanit[],
		now: Date
	): PatientChecklistItemStatus {
		const auto = item.auto;
		const bos = (status: PatientChecklistStatus, count = 0): PatientChecklistItemStatus => ({
			item_id: item.id,
			stage: item.stage,
			label: item.label,
			warning: item.warning,
			status,
			evidence_count: count,
			doc_types: auto?.kind === 'doc' ? auto.doc_types : []
		});
		// `auto` yoksa sistem karar vermez — metin insana kalır.
		if (!auto) return bos('na');
		if (evre === 'not_started') return bos('na');

		let count = 0;
		if (auto.kind === 'doc') {
			const kabul = new Set(auto.doc_types);
			count = medya.filter(
				(m) => m.visitId === visit.id && m.docType && kabul.has(m.docType)
			).length;
		} else if (auto.kind === 'visit_field') {
			count = this.vizitAlaniDolu(visit, auto.field) ? 1 : 0;
		} else {
			const eslesen = para.filter((p) => p.kind === auto.direction && this.paraVizitte(p, visit));
			count = eslesen.length;

			/*
			 * PARA-01 "Kalan ödeme": madde sayıya değil TEKLİFE bakar. Teklif yoksa
			 * sistem karar vermez (`na`) — belgede § 6.4'teki kural: kalan ancak
			 * "toplam bedel" yazılıysa hesaplanır, tahmin edilmez.
			 */
			if (auto.settle_quote) {
				const teklif = visit.quotedTotalMinor;
				if (teklif == null || visit.quotedCurrency == null) return bos('na', count);
				const tahsil = eslesen
					.filter((p) => p.currency === visit.quotedCurrency)
					.reduce((sum, p) => sum + p.amount, 0);
				if (tahsil >= teklif) return bos('done', count);
				return bos(evre === 'closed' ? 'missing' : 'na', count);
			}
		}

		if (count >= (auto.kind === 'transaction' ? (auto.min_count ?? 1) : 1)) {
			return bos('done', count);
		}
		// Vizit sürüyor: maddenin vakti henüz gelmemiş olabilir.
		if (evre === 'running') return bos('na');
		// Hekim onayı kapanıştan sonra 30 gün beklenir.
		if (auto.kind === 'doc' && auto.doc_types.includes('doctor_approval')) {
			const end = (visit.departureAt ?? visit.arrivalAt)?.getTime() ?? null;
			if (end !== null && now.getTime() - end < DOCTOR_APPROVAL_GRACE_DAYS * GUN_MS) {
				return bos('na');
			}
		}
		return bos('missing');
	}

	/** Vizitsiz grup: yalnız belge maddeleri, yalnız `done`/`na` — eksik denmez. */
	private bagsizMadde(
		item: PatientFlowChecklistItem,
		bagsiz: MediaKanit[]
	): PatientChecklistItemStatus {
		const auto = item.auto;
		const docTypes = auto?.kind === 'doc' ? auto.doc_types : [];
		let count = 0;
		if (auto?.kind === 'doc') {
			const kabul = new Set(auto.doc_types);
			count = bagsiz.filter((m) => m.docType && kabul.has(m.docType)).length;
		}
		return {
			item_id: item.id,
			stage: item.stage,
			label: item.label,
			warning: item.warning,
			status: count > 0 ? 'done' : 'na',
			evidence_count: count,
			doc_types: docTypes
		};
	}

	private vizitAlaniDolu(visit: ContactVisitRow, field: string): boolean {
		const map: Record<string, unknown> = {
			arrival_at: visit.arrivalAt,
			departure_at: visit.departureAt,
			arrival_flight: visit.arrivalFlight,
			departure_flight: visit.departureFlight,
			hotel: visit.hotel,
			transfer_provider: visit.transferProvider,
			clinic: visit.clinic,
			doctor: visit.doctor,
			treatment_plan: visit.treatmentPlan,
			notes: visit.notes
		};
		const value = map[field];
		if (value == null) return false;
		return typeof value === 'string' ? value.trim().length > 0 : true;
	}

	/**
	 * Para satırı bu vizite mi ait? Önce açık bağ (`transactions.contact_visit_id`),
	 * sonra tarih penceresi. Bağ BAŞKA bir viziti gösteriyorsa tarih penceresine
	 * düşse bile sayılmaz — yoksa aynı tutar iki vizitte birden "tamam" derdi.
	 */
	private paraVizitte(p: ParaKanit, visit: ContactVisitRow): boolean {
		if (p.visitId !== null) return p.visitId === visit.id;
		const pencere = this.vizitPencere(visit);
		return pencere !== null && this.gunIcinde(p.occurredOn, pencere);
	}

	private vizitPencere(visit: ContactVisitRow): { start: string; end: string } | null {
		const arrival = visit.arrivalAt ?? visit.departureAt;
		const departure = visit.departureAt ?? visit.arrivalAt;
		if (!arrival || !departure) return null;
		return {
			start: new Date(arrival.getTime() - GUN_MS).toISOString().slice(0, 10),
			end: new Date(departure.getTime() + GUN_MS).toISOString().slice(0, 10)
		};
	}

	private gunIcinde(day: string, pencere: { start: string; end: string }): boolean {
		return day >= pencere.start && day <= pencere.end;
	}

	/** Kişinin mesajlarına bağlı ekler — tür ve (varsa) vizit. */
	private async medyaKanitlari(db: TenantDb, contactId: string): Promise<MediaKanit[]> {
		const rows = await db
			.select({
				docType: inboundMessageMedia.docType,
				visitId: inboundMessageMedia.contactVisitId
			})
			.from(inboundMessageMedia)
			.innerJoin(
				inboundMessageContacts,
				eq(inboundMessageContacts.inboundMessageId, inboundMessageMedia.inboundMessageId)
			)
			.where(eq(inboundMessageContacts.contactId, contactId));
		return rows.map((r) => ({ docType: r.docType ?? null, visitId: r.visitId ?? null }));
	}

	/** Kişiye bağlı para işlemleri — kişi, hasta ve sorumlu rollerinin hepsi. */
	private async paraKanitlari(db: TenantDb, contactId: string): Promise<ParaKanit[]> {
		const rows = await db
			.select({
				occurredOn: transactions.occurredOn,
				kind: transactions.kind,
				visitId: transactions.contactVisitId,
				currency: transactions.currency,
				amount: transactions.amount
			})
			.from(transactions)
			.where(
				and(
					or(eq(transactions.contactId, contactId), eq(transactions.caseContactId, contactId)),
					isNull(transactions.deletedAt)
				)
			);
		return rows.map((r) => ({
			occurredOn: String(r.occurredOn),
			kind: r.kind,
			visitId: r.visitId ?? null,
			currency: r.currency ?? null,
			amount: r.amount
		}));
	}

	/** `ContactSummaryService.hastaAkisiOku` ile aynı sözleşme. */
	private async hastaAkisiOku(db: TenantDb): Promise<PatientFlow> {
		const [row] = await db
			.select({ value: tenantSettings.value })
			.from(tenantSettings)
			.where(eq(tenantSettings.key, PATIENT_FLOW_SETTING_KEY))
			.limit(1);
		if (row?.value == null) return defaultPatientFlow();
		const parsed = patientFlowSchema.safeParse(row.value);
		return parsed.success ? parsed.data : defaultPatientFlow();
	}
}
