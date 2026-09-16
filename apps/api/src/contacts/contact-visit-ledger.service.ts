import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, or } from 'drizzle-orm';
import type {
	ContactVisitLedger,
	ContactVisitLedgerRow,
	SupportedCurrency,
	VisitLedgerExpenseBucket
} from '@verimaya/shared';
import {
	VISIT_LEDGER_UNKNOWN_VISIT_LABEL,
	contactVisitDateRangeLabel,
	contactVisitTypeLabels
} from '@verimaya/shared';
import { resolveBaseAmount } from '../common/finance-base';
import { tarihtenVizitSec } from '../common/visit-window';
import { contactVisits, type ContactVisitRow } from '../db/schema/contact-visits';
import { contacts } from '../db/schema/contacts';
import { tenants } from '../db/schema/tenants';
import { transactions } from '../db/schema/transactions';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

/**
 * PARA-01 — **vizit bazlı para mutabakatı ve hasta başı kâr**
 * (`docs/2026-09-16-HASTA-AKISI.md` § 6.4).
 *
 * Finans Özet kişinin bütün para satırlarını tek torbada topluyordu. Gerçek akışta
 * ise her vizitin kendi tahsilatı ve kendi gideri var: "1. vizit 8.550 toplam,
 * 4.350 alındı, gider OGN 830 + sedasyon 4.000 TL + otel 10.075 TL". Kâr ancak bu
 * kırılımda okunur.
 *
 * **Üç karar:**
 *
 * 1. *Ödeme ile gider farklı alanlardan sayılır.* Ödeme `contact_id` ya da
 *    `case_contact_id` hastayı gösterdiğinde sayılır (tahsilat bazen eşin/refakatçinin
 *    adına yazılıyor). Gider yalnız `case_contact_id`: otel faturasının karşı tarafı
 *    oteldir, `contact_id` üzerinden saymak "hastaya ödediğimiz taksi"yi gidere değil
 *    gelire yazma riski taşır.
 *
 * 2. *Vizit ataması önce bağa, sonra tarihe bakar.* `transactions.contact_visit_id`
 *    doluysa o. Boşsa satırın günü tek bir vizitin penceresine düşüyorsa oraya sayılır
 *    (`common/visit-window.ts`, geliş − 2 … dönüş + 2) — geçmiş kayıtlar yeniden
 *    kaydedilmeden tabloya düşsün. Birden fazla vizit uyarsa "Vizit belirsiz".
 *
 * 3. *Kur yalnız anlık görüntüden.* `amount_base` çözülemeyen satır toplama girmez,
 *    `unconverted_count` ile sayılır. Eksik toplam, yanlış toplamdan iyidir.
 */

/** Kişi türü karşılaştırması — `contacts.contact_type_name` denormalize metindir. */
const PATIENT_TYPE_NAME = 'hasta';

type ParaSatiri = {
	kind: string;
	category: string | null;
	occurredOn: string;
	amount: number;
	amountBase: number | null;
	baseCurrency: string | null;
	currency: string | null;
	paidAmount: number | null;
	status: string;
	contactVisitId: string | null;
};

/** Boş satır — vizit başına tek yerde kurulur ki alanlar unutulmasın. */
function bosSatir(
	visit: ContactVisitRow | null,
	quotedCurrency: SupportedCurrency | null
): ContactVisitLedgerRow {
	const label = visit
		? [
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
				.join(' · ')
		: VISIT_LEDGER_UNKNOWN_VISIT_LABEL;

	return {
		visit_id: visit?.id ?? null,
		visit_type: (visit?.visitType as ContactVisitLedgerRow['visit_type']) ?? null,
		visit_status: (visit?.status as ContactVisitLedgerRow['visit_status']) ?? null,
		visit_label: label.slice(0, 200),
		arrival_at: visit?.arrivalAt ? visit.arrivalAt.toISOString() : null,
		income_base: 0,
		expense_base: 0,
		profit_base: 0,
		expense_by_category: [],
		quoted_total_minor: visit?.quotedTotalMinor ?? null,
		quoted_currency: quotedCurrency,
		collected_quoted_minor: visit?.quotedTotalMinor != null ? 0 : null,
		remaining_quoted_minor: visit?.quotedTotalMinor ?? null,
		other_currency_income_count: 0,
		transaction_count: 0,
		unconverted_count: 0
	};
}

@Injectable()
export class ContactVisitLedgerService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async get(tenantId: string, contactId: string): Promise<ContactVisitLedger> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [contact] = await db
				.select({ id: contacts.id, contactTypeName: contacts.contactTypeName })
				.from(contacts)
				.where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
				.limit(1);
			if (!contact) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Contact not found' }
				});
			}

			const [tenant] = await db
				.select({ baseCurrency: tenants.baseCurrency })
				.from(tenants)
				.where(eq(tenants.id, tenantId))
				.limit(1);
			const baseCurrency = (tenant?.baseCurrency ?? 'TRY') as SupportedCurrency;

			return this.computeWithDb(db, contactId, contact.contactTypeName, baseCurrency);
		});
	}

	/**
	 * Açık işlem içinde hesap. Kişi türü Hasta değilse boş döner: vizit mutabakatı
	 * hasta akışına aittir, otelin viziti olmaz.
	 */
	async computeWithDb(
		db: TenantDb,
		contactId: string,
		contactTypeName: string,
		baseCurrency: SupportedCurrency,
		now: Date = new Date()
	): Promise<ContactVisitLedger> {
		const bos: ContactVisitLedger = {
			contact_id: contactId,
			is_patient: false,
			base_currency: baseCurrency,
			rows: [],
			totals: {
				income_base: 0,
				expense_base: 0,
				profit_base: 0,
				transaction_count: 0,
				unconverted_count: 0
			},
			generated_at: now.toISOString()
		};
		if (contactTypeName.trim().toLocaleLowerCase('tr') !== PATIENT_TYPE_NAME) return bos;

		const visits = await db
			.select()
			.from(contactVisits)
			.where(and(eq(contactVisits.contactId, contactId), isNull(contactVisits.deletedAt)))
			.orderBy(contactVisits.arrivalAt, contactVisits.createdAt);

		const satirlar = await this.paraSatirlari(db, contactId);

		const rows = new Map<string | null, ContactVisitLedgerRow>();
		const giderler = new Map<string | null, Map<string | null, VisitLedgerExpenseBucket>>();
		for (const v of visits) {
			rows.set(v.id, bosSatir(v, (v.quotedCurrency as SupportedCurrency | null) ?? null));
			giderler.set(v.id, new Map());
		}
		const belirsiz = () => {
			if (!rows.has(null)) {
				rows.set(null, bosSatir(null, null));
				giderler.set(null, new Map());
			}
			return rows.get(null)!;
		};

		const adaylar = visits.map((v) => ({
			id: v.id,
			arrivalAt: v.arrivalAt,
			departureAt: v.departureAt
		}));

		for (const tx of satirlar) {
			// Bağ varsa o; yoksa tarih penceresi; o da belirsizse "Vizit belirsiz".
			const visitId =
				tx.contactVisitId && rows.has(tx.contactVisitId)
					? tx.contactVisitId
					: tarihtenVizitSec(tx.occurredOn, adaylar);
			const row = visitId !== null ? rows.get(visitId)! : belirsiz();

			row.transaction_count += 1;
			const base = resolveBaseAmount(tx, baseCurrency);
			if (base == null) {
				row.unconverted_count += 1;
			} else if (tx.kind === 'income') {
				row.income_base += base;
			} else {
				row.expense_base += base;
				const kova = giderler.get(visitId ?? null)!;
				const key = tx.category ?? null;
				const mevcut = kova.get(key) ?? { category: key, amount_base: 0, count: 0 };
				mevcut.amount_base += base;
				mevcut.count += 1;
				kova.set(key, mevcut);
			}

			/*
			 * Teklif karşılaştırması NATIVE tutarla yapılır: teklif "8.260 GBP" diye
			 * yazılmış, ödeme de GBP alınmış. Baz para birimine çevirip karşılaştırmak
			 * kur oynamasını "eksik tahsilat" gibi gösterirdi.
			 */
			if (tx.kind === 'income' && row.quoted_total_minor != null) {
				if (tx.currency === row.quoted_currency) {
					row.collected_quoted_minor = (row.collected_quoted_minor ?? 0) + tx.amount;
				} else {
					row.other_currency_income_count += 1;
				}
			}
		}

		const out: ContactVisitLedgerRow[] = [];
		for (const [visitId, row] of rows) {
			row.profit_base = row.income_base - row.expense_base;
			row.expense_by_category = [...(giderler.get(visitId) ?? new Map()).values()].sort(
				(a, b) => b.amount_base - a.amount_base
			);
			if (row.quoted_total_minor != null) {
				row.remaining_quoted_minor = row.quoted_total_minor - (row.collected_quoted_minor ?? 0);
			}
			out.push(row);
		}

		const totals = out.reduce(
			(acc, r) => ({
				income_base: acc.income_base + r.income_base,
				expense_base: acc.expense_base + r.expense_base,
				profit_base: acc.profit_base + r.profit_base,
				transaction_count: acc.transaction_count + r.transaction_count,
				unconverted_count: acc.unconverted_count + r.unconverted_count
			}),
			{
				income_base: 0,
				expense_base: 0,
				profit_base: 0,
				transaction_count: 0,
				unconverted_count: 0
			}
		);

		return {
			contact_id: contactId,
			is_patient: true,
			base_currency: baseCurrency,
			rows: out,
			totals,
			generated_at: now.toISOString()
		};
	}

	/**
	 * Hastanın para satırları.
	 *
	 * Ödeme: `contact_id` **veya** `case_contact_id` hasta. Gider: yalnız
	 * `case_contact_id`. SQL bu ayrımı yapamadığı için geniş süzgeçle çekilir,
	 * eleme burada. Bir hastanın satır sayısı onlarca mertebesinde.
	 */
	private async paraSatirlari(db: TenantDb, contactId: string): Promise<ParaSatiri[]> {
		const rows = await db
			.select({
				kind: transactions.kind,
				category: transactions.category,
				occurredOn: transactions.occurredOn,
				amount: transactions.amount,
				amountBase: transactions.amountBase,
				baseCurrency: transactions.baseCurrency,
				currency: transactions.currency,
				paidAmount: transactions.paidAmount,
				status: transactions.status,
				contactVisitId: transactions.contactVisitId,
				contactId: transactions.contactId,
				caseContactId: transactions.caseContactId
			})
			.from(transactions)
			.where(
				and(
					or(eq(transactions.contactId, contactId), eq(transactions.caseContactId, contactId)),
					isNull(transactions.deletedAt)
				)
			);

		return rows
			.filter((r) => (r.kind === 'expense' ? r.caseContactId === contactId : true))
			.map((r) => ({
				kind: r.kind,
				category: r.category,
				occurredOn: String(r.occurredOn),
				amount: r.amount,
				amountBase: r.amountBase,
				baseCurrency: r.baseCurrency,
				currency: r.currency,
				paidAmount: r.paidAmount,
				status: r.status,
				contactVisitId: r.contactVisitId
			}));
	}
}
