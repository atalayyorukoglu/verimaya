import {
	Controller,
	Get,
	Query,
	Req,
	UseGuards
} from '@nestjs/common';
import {
	aiAccuracyReportParamsSchema,
	apiKeyHasScope,
	marketingReportParams,
	reportByCategoryDetailParams,
	reportCohortsParams,
	reportPeriodCompareParams,
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
import { MeService } from '../auth/me.service';
import { PermissionOverridesService } from '../auth/permission-overrides.service';
import { hasOrgPermission } from '../auth/permissions';
import { AiAccuracyReportService } from './ai-accuracy-report.service';
import { InterventionsService } from './interventions.service';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class ReportsController {
	constructor(
		private readonly reportsService: ReportsService,
		private readonly commissionsService: CommissionsService,
		private readonly aiAccuracyReportService: AiAccuracyReportService,
		private readonly interventionsService: InterventionsService,
		private readonly meService: MeService,
		private readonly permissionOverrides: PermissionOverridesService
	) {}

	/**
	 * `compare=previous` — dönem karşılaştırması (docs/2026-08-23-maya-icgoru-sorulari.md § 6).
	 * Verilmezse cevap bugünkü şekliyle birebir aynı kalır; `from`/`to` eksikken sessizce
	 * yok sayılır.
	 */
	@Get('summary')
	@RequireOrgPermission('finance', 'read')
	summary(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string,
		@Query('compare') compare?: string
	) {
		const params = reportPeriodCompareParams.parse({ from, to, compare });
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

	/**
	 * `compare=previous` — dönem karşılaştırması (docs/2026-08-23-maya-icgoru-sorulari.md § 6).
	 * Verilmezse cevap bugünkü şekliyle birebir aynı kalır; `from`/`to` eksikken sessizce
	 * yok sayılır.
	 */
	@Get('appointment-metrics')
	@RequireOrgPermission('finance', 'read')
	appointmentMetrics(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string,
		@Query('compare') compare?: string
	) {
		const params = reportPeriodCompareParams.parse({ from, to, compare });
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

	/**
	 * Olay kaydı raporu (AI-05 girdisi). İzin `contact:read` — bu bir operasyon
	 * raporu (dosya/tür/sorumlu bazında sayı), diğer para raporları gibi `finance:read`
	 * istemiyor: bir temsilci "kaç RPT var" sorusunu görebilmeli, ciro görmeden.
	 *
	 * `cost_totals` yalnız çağıranın ayrıca `finance:read` izni varsa cevaba girer —
	 * bu tek alan para tutarı taşıyor. İzin yoksa alan tümüyle çıkarılır (403 değil,
	 * sessiz omisyon): rapor yine de sayım kısmıyla kullanılabilir kalsın diye.
	 */
	@Get('incidents')
	@RequireOrgPermission('contact', 'read')
	async incidents(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		const tenantId = getActiveOrgId(req);
		const includeCost = await this.canReadFinance(req, tenantId);
		return this.reportsService.incidents(tenantId, params, includeCost);
	}

	/**
	 * AI-05 — müdahale listesi v1 (docs/2026-08-23-maya-icgoru-sorulari.md § 7 adım 7).
	 * İzin taban `contact:read`. `revenue_drop` ve `referral_value` bulguları (para
	 * rakamı taşıyanlar) yalnız çağıranın ayrıca `finance:read`'i varsa cevaba girer —
	 * `incidents` ile aynı desen: 403 değil sessiz omisyon, `canReadFinance` aynen kullanılır.
	 *
	 * Cümleler burada üretilmez — sunucu yapılandırılmış bulgu döner, web `messages.ts`
	 * şablonundan cümleyi kurar.
	 */
	@Get('interventions')
	@RequireOrgPermission('contact', 'read')
	async interventions(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		const tenantId = getActiveOrgId(req);
		const includeFinance = await this.canReadFinance(req, tenantId);
		return this.interventionsService.get(tenantId, params, includeFinance);
	}

	private async canReadFinance(req: FastifyRequest, tenantId: string): Promise<boolean> {
		if (req.apiKeyAuth) {
			return apiKeyHasScope(req.apiKeyAuth.scopes, 'finance', 'read');
		}
		const session = req.authSession;
		if (!session) return false;
		const role = await this.meService.resolveOrganizationRole({
			userId: session.user.id,
			activeOrganizationId: tenantId,
			requestId: String(req.id)
		});
		const deniedKeys = await this.permissionOverrides.getDeniedKeys(tenantId);
		return hasOrgPermission(role, 'finance', 'read', deniedKeys);
	}
}
