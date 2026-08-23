import { Injectable } from '@nestjs/common';
import { and, asc, eq, gte, isNull, lte, type SQL } from 'drizzle-orm';
import {
	calendarDaysBetween,
	evaluateFinding,
	INTERVENTIONS_MAX_ITEMS_PER_GROUP,
	previousReportPeriod,
	sortFindingsBySeverity,
	utcTodayIsoDate,
	type InterventionGroup,
	type InterventionOpenIncidentItem,
	type InterventionQualityDropItem,
	type InterventionQualityMetric,
	type InterventionRevenueDropItem,
	type InterventionReferralValueItem,
	type InterventionsReport,
	type ReportAppointmentMetricsData,
	type ReportDoctorMetricsRow,
	type ReportPeriodParams
} from '@verimaya/shared';
import { contacts, incidents, incidentTypes } from '../db/schema';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ReportsService } from './reports.service';

/** `part/total`; `total === 0` → `0` (aynı tanım `reports.service.ts`'teki `rate` ile). */
function rate(part: number, total: number): number {
	return total === 0 ? 0 : part / total;
}

/**
 * AI-05 — müdahale listesi v1. `docs/2026-08-23-maya-icgoru-sorulari.md` § 7 adım 7.
 *
 * **Dil modeli yok.** Bu servis yalnız yapılandırılmış bulgu üretir; cümleyi web
 * `messages.ts` şablonundan kurar. Eşik/önem sırası kararı tamamen
 * `packages/shared/src/report-thresholds.ts`'ten gelir — burada yeniden icat edilmez.
 *
 * **Agregasyon yeniden kullanılır.** Gelir/oran tanımı çatallaşmasın diye bu servis kendi
 * SQL'ini yazmaz — `ReportsService.appointmentMetrics` / `.summary` / `.referrals`
 * çağrılarını tekrar kullanır. Tek istisna `open_incident`: mevcut `incidents` raporu
 * yalnız agregat sayım döndürüyor (bkz. `ReportsService.incidents`), tek tek açık kayıt
 * satırı hiçbir yerde yok — bu servis onu doğrudan (küçük, salt-okunur bir sorguyla) çeker.
 */
@Injectable()
export class InterventionsService {
	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly reportsService: ReportsService
	) {}

	async get(
		tenantId: string,
		params: ReportPeriodParams,
		includeFinance: boolean
	): Promise<InterventionsReport> {
		const period = { from: params.from ?? null, to: params.to ?? null };
		const previousWindow = previousReportPeriod(params.from, params.to);

		const [qualityDrop, revenueDrop, openIncident, referralValue] = await Promise.all([
			this.buildQualityDrop(tenantId, params, previousWindow),
			includeFinance ? this.buildRevenueDrop(tenantId, params, previousWindow) : [],
			this.buildOpenIncidents(tenantId, params),
			includeFinance ? this.buildReferralValue(tenantId, params) : []
		]);

		const groups: InterventionGroup[] = (
			[
				{ kind: 'quality_drop', items: qualityDrop },
				{ kind: 'revenue_drop', items: revenueDrop },
				{ kind: 'open_incident', items: openIncident },
				{ kind: 'referral_value', items: referralValue }
			] satisfies InterventionGroup[]
		).filter((group) => group.items.length > 0);

		return { period, previous_period: previousWindow, groups };
	}

	/**
	 * `quality_drop` — yalnız hekim kırılımı (bkz. `report-interventions.ts` yorumu:
	 * klinik kırılımı bu üç metriği taşımıyor). Atanmamış hekim (`doctor_contact_id: null`)
	 * atlanır — eyleme dönük bir "şuna bak" için işaret edilecek bir kişi gerekir.
	 */
	private async buildQualityDrop(
		tenantId: string,
		params: ReportPeriodParams,
		previousWindow: { from: string; to: string } | null
	): Promise<InterventionQualityDropItem[]> {
		if (!previousWindow) return [];
		const ops = await this.reportsService.appointmentMetrics(tenantId, {
			...params,
			compare: 'previous'
		});
		if (!ops.previous) return [];

		const link = {
			route: '/reports',
			params: {
				tab: 'ozet',
				...(params.from ? { from: params.from } : {}),
				...(params.to ? { to: params.to } : {})
			}
		};

		// 'RPT' sunucuya gömülmez — tenant sözlüğünde bu ad yoksa (yeniden adlandırılmış/
		// silinmişse) rpt_rate metriği bu dönem için hiç üretilmez, sessizce atlanır.
		const hasRptType = ops.by_appointment_type.some((t) => t.appointment_type === 'RPT');

		const prevDoctorById = new Map<string, ReportDoctorMetricsRow>();
		for (const row of ops.previous.by_doctor) {
			if (row.doctor_contact_id) prevDoctorById.set(row.doctor_contact_id, row);
		}
		const rptCountByDoctor = (data: ReportAppointmentMetricsData) => {
			const map = new Map<string, number>();
			for (const row of data.by_doctor_type) {
				if (row.doctor_contact_id && row.appointment_type === 'RPT') {
					map.set(row.doctor_contact_id, (map.get(row.doctor_contact_id) ?? 0) + row.count);
				}
			}
			return map;
		};
		const currentRpt = hasRptType ? rptCountByDoctor(ops) : new Map<string, number>();
		const previousRpt = hasRptType ? rptCountByDoctor(ops.previous) : new Map<string, number>();

		const items: InterventionQualityDropItem[] = [];
		const consider = (
			doctor: ReportDoctorMetricsRow,
			metric: InterventionQualityMetric,
			current: number,
			previousValue: number
		) => {
			const finding = evaluateFinding(metric, {
				current,
				previous: previousValue,
				sampleSize: doctor.total
			});
			if (!finding.reportable) return;
			items.push({
				kind: 'quality_drop',
				subject_type: 'doctor',
				subject_id: doctor.doctor_contact_id!,
				subject_name: doctor.doctor_name,
				metric,
				current,
				previous: previousValue,
				sample_size: doctor.total,
				severity: finding.severity,
				link
			});
		};

		for (const doctor of ops.by_doctor) {
			if (!doctor.doctor_contact_id) continue;
			const previous = prevDoctorById.get(doctor.doctor_contact_id);
			if (!previous) continue;

			consider(
				doctor,
				'no_show_rate',
				rate(doctor.no_show, doctor.total),
				rate(previous.no_show, previous.total)
			);
			consider(
				doctor,
				'cancel_rate',
				rate(doctor.cancelled, doctor.total),
				rate(previous.cancelled, previous.total)
			);
			if (hasRptType) {
				const currentRptCount = currentRpt.get(doctor.doctor_contact_id) ?? 0;
				const previousRptCount = previousRpt.get(doctor.doctor_contact_id) ?? 0;
				consider(
					doctor,
					'rpt_rate',
					rate(currentRptCount, doctor.total),
					rate(previousRptCount, previous.total)
				);
			}
		}

		return sortFindingsBySeverity(items).slice(0, INTERVENTIONS_MAX_ITEMS_PER_GROUP);
	}

	/** `revenue_drop` — konu tenant'ın kendisi (`income`/`net`), bir kişi değil. */
	private async buildRevenueDrop(
		tenantId: string,
		params: ReportPeriodParams,
		previousWindow: { from: string; to: string } | null
	): Promise<InterventionRevenueDropItem[]> {
		if (!previousWindow) return [];
		const summary = await this.reportsService.summary(tenantId, { ...params, compare: 'previous' });
		if (!summary.previous) return [];

		const link = {
			route: '/reports',
			params: {
				tab: 'ozet',
				...(params.from ? { from: params.from } : {}),
				...(params.to ? { to: params.to } : {})
			}
		};

		const items: InterventionRevenueDropItem[] = [];
		const consider = (
			metric: 'income' | 'net',
			current: number,
			previousValue: number
		) => {
			// Dönem toplamı olarak dönemin gelirini kullanıyoruz: hem income'un kendi
			// ölçeği hem net'in mutlak değişiminin işletme büyüklüğüne göre anlamlı olup
			// olmadığının referansı (bkz. report-thresholds.ts `minShareOfTotal` gerekçesi).
			const finding = evaluateFinding(metric, {
				current,
				previous: previousValue,
				sampleSize: summary.transaction_count,
				periodTotal: summary.income_base
			});
			if (!finding.reportable) return;
			items.push({
				kind: 'revenue_drop',
				subject_type: 'metric',
				subject_id: metric,
				subject_name: null,
				metric,
				current,
				previous: previousValue,
				sample_size: summary.transaction_count,
				severity: finding.severity,
				link
			});
		};

		consider('income', summary.income_base, summary.previous.income_base);
		consider('net', summary.net_base, summary.previous.net_base);

		return sortFindingsBySeverity(items).slice(0, INTERVENTIONS_MAX_ITEMS_PER_GROUP);
	}

	/**
	 * `open_incident` — delta değil mevcut durum: eşik uygulanmaz, en eskiden yeniye
	 * (en uzun süredir açık olan üstte) sıralanır ve ilk
	 * `INTERVENTIONS_MAX_ITEMS_PER_GROUP` kayıt döner.
	 */
	private async buildOpenIncidents(
		tenantId: string,
		params: ReportPeriodParams
	): Promise<InterventionOpenIncidentItem[]> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const conditions: SQL[] = [isNull(incidents.deletedAt), eq(incidents.status, 'open')];
			if (params.from) conditions.push(gte(incidents.occurredOn, params.from));
			if (params.to) conditions.push(lte(incidents.occurredOn, params.to));

			const rows = await db
				.select({
					id: incidents.id,
					contactId: incidents.contactId,
					contactName: contacts.displayName,
					incidentTypeName: incidentTypes.name,
					area: incidents.area,
					occurredOn: incidents.occurredOn
				})
				.from(incidents)
				.innerJoin(contacts, eq(incidents.contactId, contacts.id))
				.innerJoin(incidentTypes, eq(incidents.incidentTypeId, incidentTypes.id))
				.where(and(...conditions))
				.orderBy(asc(incidents.occurredOn))
				.limit(INTERVENTIONS_MAX_ITEMS_PER_GROUP);

			const today = utcTodayIsoDate();
			return rows.map((row): InterventionOpenIncidentItem => {
				const daysOpen = Math.max(0, calendarDaysBetween(row.occurredOn, today));
				return {
					kind: 'open_incident',
					subject_type: 'contact',
					subject_id: row.contactId,
					subject_name: row.contactName,
					incident_id: row.id,
					incident_type_name: row.incidentTypeName,
					area: row.area,
					occurred_on: row.occurredOn,
					days_open: daysOpen,
					severity: daysOpen,
					link: { route: '/contacts/[id]', params: { id: row.contactId } }
				};
			});
		});
	}

	/**
	 * `referral_value` — değer tipi, eşik değil ilk N kuralı. `ReportsService.referrals`
	 * zaten `total_net_base` azalan sıralı döner; burada yalnız pozitif net'i olanlardan
	 * ilk `INTERVENTIONS_MAX_ITEMS_PER_GROUP` alınır.
	 */
	private async buildReferralValue(
		tenantId: string,
		params: ReportPeriodParams
	): Promise<InterventionReferralValueItem[]> {
		const referrals = await this.reportsService.referrals(tenantId, params);
		const link = {
			route: '/reports/referrals',
			params: {
				...(params.from ? { from: params.from } : {}),
				...(params.to ? { to: params.to } : {})
			}
		};

		return referrals.items
			.filter((row) => row.total_net_base > 0)
			.slice(0, INTERVENTIONS_MAX_ITEMS_PER_GROUP)
			.map(
				(row): InterventionReferralValueItem => ({
					kind: 'referral_value',
					subject_type: 'contact',
					subject_id: row.referrer_contact_id,
					subject_name: row.referrer_display_name,
					coordinator_name: row.coordinator_name,
					referred_count: row.referred_count,
					total_net_base: row.total_net_base,
					severity: row.total_net_base,
					link
				})
			);
	}
}
