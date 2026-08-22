import { Injectable, Logger } from '@nestjs/common';
import { and, eq, ilike, isNull, or } from 'drizzle-orm';
import {
	DEFAULT_TENANT_TIMEZONE,
	MAYA_TOOL_ITEM_LIMIT,
	MAYA_TOOL_PERMISSIONS,
	apiKeyHasScope,
	appointmentListQuerySchema,
	mayaPeriodRange,
	reportUntouchedContactsParams,
	supportedCurrencySchema,
	toTenantDayKey,
	type MayaPeriod,
	type MayaToolCall,
	type MayaToolName,
	type MayaToolResult,
	type MayaUntouchedDays,
	type SupportedCurrency
} from '@verimaya/shared';
import { AppointmentsService } from '../appointments/appointments.service';
import { MeService } from '../auth/me.service';
import { PermissionOverridesService } from '../auth/permission-overrides.service';
import { hasOrgPermission } from '../auth/permissions';
import { ContactsService } from '../contacts/contacts.service';
import { contacts, tenants } from '../db/schema';
import { ReportsService } from '../reports/reports.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import {
	contactSearchTermsFromQuestion,
	type MayaContactCandidate,
	type MayaContactMatch
} from './maya-contact-match';

/**
 * Maya çağrısını yapan kimlik. İzin çözümü için gerekir — `POST /v1/maya/ask`
 * guard'ı yalnız `settings:read` istiyor, araç izinleri burada ayrıca çözülür.
 */
export type MayaActor =
	| { kind: 'session'; userId: string; requestId: string }
	| { kind: 'api_key'; scopes: readonly string[] };

/**
 * AI-11a — araç izni + araç çalıştırma.
 *
 * **En kritik sınır burada.** `POST /v1/maya/ask` yalnız `settings:read` ister ve bunu
 * her rol geçer. Araçlar bu endpoint'in arkasında olduğu için izin **araç başına,
 * çalışma anında** kontrol edilir — `OrgPermissionGuard` ile birebir aynı zincir
 * (rol çöz → tenant deny override'ları al → `hasOrgPermission`). Aksi hâlde finans
 * izni olmayan temsilci Maya üzerinden finans verisi alırdı: yetki yükseltme açığı.
 *
 * İzin yoksa araç **çalıştırılmaz** ve cevap `BILINMIYOR` olur. "Yetkin yok" bile
 * denmez — verinin varlığı da bir bilgidir, sızdırılmaz.
 */
@Injectable()
export class MayaToolsService {
	private readonly logger = new Logger(MayaToolsService.name);

	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly contactsService: ContactsService,
		private readonly reports: ReportsService,
		private readonly appointments: AppointmentsService,
		private readonly meService: MeService,
		private readonly permissionOverrides: PermissionOverridesService
	) {}

	/**
	 * Sorudaki isim adaylarını tenant kapsamında arar. RLS + `withTenant` yüzünden
	 * başka tenant'ın kişisi buraya hiç gelmez.
	 */
	async findContactCandidates(
		tenantId: string,
		question: string
	): Promise<MayaContactCandidate[]> {
		const terms = contactSearchTermsFromQuestion(question);
		if (terms.length === 0) return [];

		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db
				.select({ id: contacts.id, displayName: contacts.displayName })
				.from(contacts)
				.where(
					and(
						isNull(contacts.deletedAt),
						or(...terms.map((term) => ilike(contacts.displayName, `%${term}%`)))
					)
				)
				.limit(60);
			return rows.map((row) => ({ id: row.id, displayName: row.displayName }));
		});
	}

	/** `OrgPermissionGuard` (org-permission.guard.ts) ile aynı çözüm zinciri. */
	async isToolAllowed(
		tenantId: string,
		actor: MayaActor,
		tool: MayaToolName
	): Promise<boolean> {
		const { resource, action } = MAYA_TOOL_PERMISSIONS[tool];

		if (actor.kind === 'api_key') {
			// API anahtarlarında rol override'ı geçerli değil; ACL açık scope listesidir.
			return apiKeyHasScope(actor.scopes, resource, action);
		}

		try {
			const role = await this.meService.resolveOrganizationRole({
				userId: actor.userId,
				activeOrganizationId: tenantId,
				requestId: actor.requestId
			});
			const deniedKeys = await this.permissionOverrides.getDeniedKeys(tenantId);
			return hasOrgPermission(role, resource, action, deniedKeys);
		} catch {
			// Rol çözülemiyorsa izin yok sayılır (deny-by-default).
			return false;
		}
	}

	/**
	 * Aracı çalıştırır. **Rakamın tek kaynağı burasıdır** — dönen her alan Postgres'ten
	 * gelir, model bu sonucu hiç görmez.
	 *
	 * `matches` sunucunun çözdüğü kişi listesidir; modelin verdiği `contact_ref` bu
	 * listede yoksa araç çalıştırılmaz (uydurulmuş UUID ile veri çekilemez).
	 */
	async run(
		tenantId: string,
		call: MayaToolCall,
		matches: readonly MayaContactMatch[]
	): Promise<MayaToolResult | null> {
		try {
			switch (call.tool) {
				case 'contactBalance':
					return await this.contactBalance(tenantId, call.params.contact_ref, matches);
				case 'openBalances':
					return await this.openBalances(tenantId);
				case 'contactAppointments':
					return await this.contactAppointments(tenantId, call.params.contact_ref, matches);
				case 'periodSummary':
					return await this.periodSummary(tenantId, call.params.period);
				case 'untouchedContacts':
					return await this.untouchedContacts(tenantId, call.params.days);
			}
		} catch (err) {
			// Araç patlarsa uydurma cevap üretmektense BILINMIYOR demek doğrudur.
			this.logger.warn(
				`Maya tool ${call.tool} failed: ${err instanceof Error ? err.message : String(err)}`
			);
			return null;
		}
	}

	private resolveMatch(
		contactRef: string,
		matches: readonly MayaContactMatch[]
	): MayaContactMatch | null {
		return matches.find((m) => m.id === contactRef) ?? null;
	}

	private async contactBalance(
		tenantId: string,
		contactRef: string,
		matches: readonly MayaContactMatch[]
	): Promise<MayaToolResult | null> {
		const match = this.resolveMatch(contactRef, matches);
		if (!match) return null;

		const summary = await this.contactsService.financeSummary(tenantId, match.id);
		const baseCurrency = await this.tenantContext.withTenant(tenantId, ({ db }) =>
			this.tenantBaseCurrency(db, tenantId)
		);

		return {
			tool: 'contactBalance',
			contact_id: match.id,
			contact_label: match.displayName,
			base_currency: baseCurrency,
			income_base: summary.income_base,
			expense_base: summary.expense_base,
			net_base: summary.net_base,
			paid_base: summary.paid_base,
			outstanding_base: summary.outstanding_base,
			transaction_count: summary.transaction_count
		};
	}

	private async openBalances(tenantId: string): Promise<MayaToolResult> {
		const balances = await this.reports.balances(tenantId);
		return {
			tool: 'openBalances',
			items: balances.items.slice(0, MAYA_TOOL_ITEM_LIMIT),
			total_count: balances.items.length
		};
	}

	private async contactAppointments(
		tenantId: string,
		contactRef: string,
		matches: readonly MayaContactMatch[]
	): Promise<MayaToolResult | null> {
		const match = this.resolveMatch(contactRef, matches);
		if (!match) return null;

		const todayKey = await this.tenantContext.withTenant(tenantId, async ({ db }) =>
			toTenantDayKey(new Date(), await this.tenantTimezone(db, tenantId))
		);

		const page = await this.appointments.list(
			tenantId,
			appointmentListQuerySchema.parse({
				contact_involves: match.id,
				from: todayKey,
				limit: 25
			})
		);

		const upcoming = [...page.items].sort((a, b) => a.starts_at.localeCompare(b.starts_at));

		return {
			tool: 'contactAppointments',
			contact_id: match.id,
			contact_label: match.displayName,
			items: upcoming.slice(0, MAYA_TOOL_ITEM_LIMIT).map((a) => ({
				appointment_id: a.id,
				starts_at: a.starts_at,
				status: a.status,
				title: a.title,
				clinic_name: a.clinic_name
			})),
			total_count: upcoming.length
		};
	}

	private async periodSummary(
		tenantId: string,
		period: MayaPeriod
	): Promise<MayaToolResult> {
		const { timezone, baseCurrency } = await this.tenantContext.withTenant(
			tenantId,
			async ({ db }) => ({
				timezone: await this.tenantTimezone(db, tenantId),
				baseCurrency: await this.tenantBaseCurrency(db, tenantId)
			})
		);

		// Tarihi model üretmiyor: kapalı kümedeki dönem adı, tenant saat dilimindeki
		// bugüne göre burada gerçek aralığa çevriliyor.
		const range = mayaPeriodRange(period, toTenantDayKey(new Date(), timezone));
		const summary = await this.reports.summary(tenantId, range);

		return {
			tool: 'periodSummary',
			period,
			from: range.from,
			to: range.to,
			base_currency: baseCurrency,
			income_base: summary.income_base,
			expense_base: summary.expense_base,
			net_base: summary.net_base,
			pending_base: summary.pending_base,
			transaction_count: summary.transaction_count
		};
	}

	private async untouchedContacts(
		tenantId: string,
		days: MayaUntouchedDays
	): Promise<MayaToolResult> {
		const result = await this.reports.untouchedContacts(
			tenantId,
			reportUntouchedContactsParams.parse({ days, limit: MAYA_TOOL_ITEM_LIMIT })
		);

		return {
			tool: 'untouchedContacts',
			days,
			total: result.total,
			buckets: result.buckets,
			// Telefon/e-posta bilinçli olarak taşınmıyor — cevap için gerekmiyor.
			items: result.items.slice(0, MAYA_TOOL_ITEM_LIMIT).map((row) => ({
				contact_id: row.contact_id,
				display_name: row.display_name,
				days_since: row.days_since,
				last_activity_at: row.last_activity_at,
				last_activity_source: row.last_activity_source
			}))
		};
	}

	/**
	 * AUDIT-01: `tenants` tablosunda RLS yok — açık `where` şart, yoksa Postgres
	 * hangi satırı ilk tararsa onu döner.
	 */
	private async tenantBaseCurrency(
		db: TenantDb,
		tenantId: string
	): Promise<SupportedCurrency> {
		const [row] = await db
			.select({ baseCurrency: tenants.baseCurrency })
			.from(tenants)
			.where(eq(tenants.id, tenantId))
			.limit(1);
		const parsed = supportedCurrencySchema.safeParse(row?.baseCurrency);
		return parsed.success ? parsed.data : 'TRY';
	}

	private async tenantTimezone(db: TenantDb, tenantId: string): Promise<string> {
		const [row] = await db
			.select({ timezone: tenants.timezone })
			.from(tenants)
			.where(eq(tenants.id, tenantId))
			.limit(1);
		return row?.timezone ?? DEFAULT_TENANT_TIMEZONE;
	}
}
