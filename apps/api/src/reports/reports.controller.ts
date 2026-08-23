import {
	Controller,
	Get,
	Query,
	Req,
	UseGuards
} from '@nestjs/common';
import {
	aiAccuracyReportParamsSchema,
	marketingReportParams,
	reportByCategoryDetailParams,
	reportCohortsParams,
	reportPeriodParams,
	reportTransactionDuplicatesParams,
	reportUntouchedContactsParams
} from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../common/auth-or-api-key.guard';
import { parseQuery } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { CommissionsService } from '../commissions/commissions.service';
import { AiAccuracyReportService } from './ai-accuracy-report.service';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class ReportsController {
	constructor(
		private readonly reportsService: ReportsService,
		private readonly commissionsService: CommissionsService,
		private readonly aiAccuracyReportService: AiAccuracyReportService
	) {}

	@Get('summary')
	@RequireOrgPermission('finance', 'read')
	summary(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		return this.reportsService.summary(getActiveOrgId(req), params);
	}

	@Get('by-category')
	@RequireOrgPermission('finance', 'read')
	byCategory(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		return this.reportsService.byCategory(getActiveOrgId(req), params);
	}

	@Get('by-category-detail')
	@RequireOrgPermission('finance', 'read')
	byCategoryDetail(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string,
		@Query('category') category?: string
	) {
		const params = reportByCategoryDetailParams.parse({ from, to, category });
		return this.reportsService.byCategoryDetail(getActiveOrgId(req), params);
	}

	@Get('by-responsible')
	@RequireOrgPermission('finance', 'read')
	byResponsible(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		return this.reportsService.byResponsible(getActiveOrgId(req), params);
	}

	@Get('monthly')
	@RequireOrgPermission('finance', 'read')
	monthly(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		return this.reportsService.monthly(getActiveOrgId(req), params);
	}

	@Get('marketing')
	@RequireOrgPermission('finance', 'read')
	marketing(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string,
		@Query('provider') provider?: string
	) {
		const params = marketingReportParams.parse({ from, to, provider });
		return this.reportsService.marketing(getActiveOrgId(req), params);
	}

	@Get('contact-distribution')
	@RequireOrgPermission('finance', 'read')
	contactDistribution(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		return this.reportsService.contactDistribution(getActiveOrgId(req), params);
	}

	@Get('appointment-metrics')
	@RequireOrgPermission('finance', 'read')
	appointmentMetrics(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		return this.reportsService.appointmentMetrics(getActiveOrgId(req), params);
	}

	@Get('consistency')
	@RequireOrgPermission('finance', 'read')
	consistency(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		return this.reportsService.consistency(getActiveOrgId(req), params);
	}

	@Get('transaction-duplicates')
	@RequireOrgPermission('finance', 'read')
	transactionDuplicates(
		@Req() req: FastifyRequest,
		@Query() query: Record<string, unknown>
	) {
		const params = parseQuery(reportTransactionDuplicatesParams, query, req);
		return this.reportsService.transactionDuplicates(getActiveOrgId(req), params);
	}

	@Get('balances')
	@RequireOrgPermission('finance', 'read')
	balances(@Req() req: FastifyRequest) {
		return this.reportsService.balances(getActiveOrgId(req));
	}

	@Get('commission-summary')
	@RequireOrgPermission('finance', 'read')
	commissionSummary(@Req() req: FastifyRequest) {
		return this.commissionsService.summary(getActiveOrgId(req));
	}

	/**
	 * Temassız kişiler. İzin `contact:read` — bu bir kişi listesi, finans raporu değil;
	 * temsilcinin (agent) de görmesi gerekir, finans görmesi gerekmez.
	 */
	@Get('untouched-contacts')
	@RequireOrgPermission('contact', 'read')
	untouchedContacts(@Req() req: FastifyRequest, @Query() query: Record<string, unknown>) {
		const params = parseQuery(reportUntouchedContactsParams, query, req);
		return this.reportsService.untouchedContacts(getActiveOrgId(req), params);
	}

	/**
	 * Tarih bazlı kohort. İzin `finance:read`.
	 * Kampanya atıfı değildir — yanıt `note_key: cohort_attribution_assumption` taşır.
	 */
	@Get('cohorts')
	@RequireOrgPermission('finance', 'read')
	cohorts(@Req() req: FastifyRequest, @Query() query: Record<string, unknown>) {
		const params = parseQuery(reportCohortsParams, query, req);
		return this.reportsService.cohorts(getActiveOrgId(req), params);
	}

	/**
	 * AI-03 — isabet ölçümü. İzin `finance:read`: en ağırlıklı veri kaynağı
	 * `ai_corrections` finans taslağı düzeltmeleri (WhatsApp onayında `amount`/
	 * `category`/… diffi) ve rapor bu sayfadaki diğer her rapor gibi zaten
	 * `finance:read` arkasında. Diğer iki kaynak (öneri kabul oranı, Maya soru
	 * istatistiği) yalnız agregat sayı döner — ham hasta/kişi kaydı yok, daha dar
	 * bir izne (`contact:read`) gerek yok. Yeni yetki açılmadı.
	 */
	@Get('ai-accuracy')
	@RequireOrgPermission('finance', 'read')
	aiAccuracy(@Req() req: FastifyRequest, @Query() query: Record<string, unknown>) {
		const params = parseQuery(aiAccuracyReportParamsSchema, query, req);
		return this.aiAccuracyReportService.get(getActiveOrgId(req), params);
	}

	/**
	 * İhtiyaç haritası §A — referans değeri raporu. İzin `finance:read`: ciro rakamı
	 * döndürüyor (`untouched-contacts` gibi salt kişi listesi değil).
	 */
	@Get('referrals')
	@RequireOrgPermission('finance', 'read')
	referrals(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		return this.reportsService.referrals(getActiveOrgId(req), params);
	}
}
