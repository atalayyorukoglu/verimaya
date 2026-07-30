/**
 * Product scorecard auto-fill from known system state (Adım 35).
 * Never invents answers when evidence is missing. Manual answers are not overwritten.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import type { ScorecardCriterionId, ScorecardScore } from '@verimaya/shared';
import { LLM_PARSE_JOB_TYPE } from '../integrations/llm';
import { aiCorrections } from '../db/schema/ai-corrections';
import { apiKeys } from '../db/schema/api-keys';
import { auditLogs } from '../db/schema/audit';
import { inboundMessages } from '../db/schema/inbound-messages';
import { jobs } from '../db/schema/queue';
import {
	scorecardAnswers,
	scorecardAssessments,
	scorecardProfiles
} from '../db/schema/scorecard';
import { tenantCredentials } from '../db/schema/tenant-credentials';
import { tenantSettings } from '../db/schema/tenant-settings';
import { webhookSubscriptions } from '../db/schema/webhook-subscriptions';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

export const AUTO_FILL_CRITERION_IDS = [
	'2.4',
	'3.2',
	'4.5',
	'4.6',
	'5.4',
	'7.2',
	'7.6',
	'8.5'
] as const satisfies readonly ScorecardCriterionId[];

export type AutoFillSuggestion = {
	criterion_id: (typeof AUTO_FILL_CRITERION_IDS)[number];
	score: ScorecardScore;
	evidence_note: string;
};

export type AutoFillResult = {
	assessment_id: string;
	written: AutoFillSuggestion[];
	skipped_manual: string[];
	skipped_no_evidence: string[];
};

const WHATSAPP_AI_DISCLOSURE_KEY = 'whatsapp_ai_disclosure';
const LOOKBACK_DAYS = 90;
const KEY_PERSON_SHARE_THRESHOLD = 0.7;
const KEY_PERSON_MIN_EVENTS = 10;

/** Pure: map connected-system count → 2.4 score (fewer silos = better). */
export function scoreConnectedSystems(connectedCount: number): AutoFillSuggestion | null {
	if (connectedCount <= 0) return null;
	let score: ScorecardScore;
	if (connectedCount === 1) score = 4;
	else if (connectedCount <= 3) score = 2;
	else score = 0;
	return {
		criterion_id: '2.4',
		score,
		evidence_note: `query=count(tenant_credentials)+active_api_keys+active_webhooks; connected=${connectedCount}`
	};
}

/** Pure: last llm.parse ledger row → 3.2. */
export function scoreLlmModelKnown(input: {
	provider: string | null;
	model: string | null;
	path: string | null;
} | null): AutoFillSuggestion | null {
	if (!input) return null;
	const provider = input.provider?.trim() || null;
	const model = input.model?.trim() || null;
	if (!provider && !model) return null;
	const knownRealModel = Boolean(model) && provider !== 'heuristic';
	const score: ScorecardScore = knownRealModel ? 4 : 2;
	return {
		criterion_id: '3.2',
		score,
		evidence_note: `query=jobs.llm.parse.latest; provider=${provider ?? 'null'}; model=${model ?? 'null'}; path=${input.path ?? 'null'}`
	};
}

/** Pure: recent correction exists → 4.5. */
export function scoreRecentCorrections(hasRecent: boolean): AutoFillSuggestion | null {
	if (!hasRecent) return null;
	return {
		criterion_id: '4.5',
		score: 4,
		evidence_note: `query=ai_corrections.exists; lookback_days=${LOOKBACK_DAYS}; has_recent=true`
	};
}

/**
 * Pure: actor concentration → 4.6 (observation, not certainty).
 * Insufficient volume → null (do not invent).
 */
export function scoreKeyPersonRisk(
	shares: { actor: string; count: number }[]
): AutoFillSuggestion | null {
	const total = shares.reduce((s, r) => s + r.count, 0);
	if (total < KEY_PERSON_MIN_EVENTS || shares.length === 0) return null;
	const top = [...shares].sort((a, b) => b.count - a.count)[0]!;
	const share = top.count / total;
	const score: ScorecardScore = share >= KEY_PERSON_SHARE_THRESHOLD ? 0 : 4;
	return {
		criterion_id: '4.6',
		score,
		evidence_note: `query=audit_logs.actor_distribution; lookback_days=${LOOKBACK_DAYS}; observation_only=true; top_actor=${top.actor}; top_share=${share.toFixed(2)}; total_events=${total}`
	};
}

/** Pure: inbound approve/ignore → 5.4. */
export function scoreControlProportionality(input: {
	approved: number;
	ignored: number;
}): AutoFillSuggestion | null {
	const decided = input.approved + input.ignored;
	if (decided <= 0) return null;
	const hasBoth = input.approved > 0 && input.ignored > 0;
	const score: ScorecardScore = hasBoth ? 4 : 2;
	return {
		criterion_id: '5.4',
		score,
		evidence_note: `query=inbound_messages.status; approved=${input.approved}; ignored=${input.ignored}; decided=${decided}`
	};
}

/** Pure: catch-bad-output path → 7.2 (ignore and/or corrections). */
export function scoreCatchBadOutput(input: {
	ignored: number;
	corrections: number;
}): AutoFillSuggestion | null {
	if (input.ignored <= 0 && input.corrections <= 0) return null;
	const score: ScorecardScore =
		input.ignored > 0 && input.corrections > 0 ? 4 : 2;
	return {
		criterion_id: '7.2',
		score,
		evidence_note: `query=inbound_messages.ignored+ai_corrections; ignored=${input.ignored}; corrections=${input.corrections}`
	};
}

/**
 * Pure: disclosure setting known → 7.6.
 * System always knows enabled state when a settings row exists OR caller passes explicit default.
 * Pass `known: false` to skip (no invent).
 */
export function scoreAiDisclosure(input: {
	known: boolean;
	enabled: boolean;
}): AutoFillSuggestion | null {
	if (!input.known) return null;
	return {
		criterion_id: '7.6',
		score: input.enabled ? 4 : 0,
		evidence_note: `query=tenant_settings.whatsapp_ai_disclosure; enabled=${input.enabled}`
	};
}

/**
 * Pure: TCO control-time proxy → 8.5.
 * Requires both machine cost ledger and human decide activity — otherwise skip.
 */
export function scoreTcoHumanTime(input: {
	parseCount: number;
	costMicros: number;
	decidedCount: number;
}): AutoFillSuggestion | null {
	if (input.parseCount <= 0 || input.decidedCount <= 0) return null;
	return {
		criterion_id: '8.5',
		score: 4,
		evidence_note: `query=jobs.llm.parse.cost+inbound_messages.decided; parse_count=${input.parseCount}; cost_usd_micros=${input.costMicros}; decided=${input.decidedCount}; note=minute-level human time not metered`
	};
}

@Injectable()
export class ScorecardAutoFillService {
	constructor(private readonly tenantContext: TenantContextService) {}

	/**
	 * Collect suggestions (no writes). Empty evidence → omitted.
	 */
	async collectSuggestions(tenantId: string): Promise<AutoFillSuggestion[]> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			return this.collectWithDb(db, tenantId);
		});
	}

	/**
	 * Write auto answers onto the open (or given) assessment.
	 * Skips criterion ids that already have `source=manual`.
	 */
	async applyAutoFill(
		tenantId: string,
		assessmentId?: string
	): Promise<AutoFillResult> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const assessment = await this.resolveAssessment(db, tenantId, assessmentId);
			const suggestions = await this.collectWithDb(db, tenantId);

			const existing = await db
				.select()
				.from(scorecardAnswers)
				.where(
					and(
						eq(scorecardAnswers.tenantId, tenantId),
						eq(scorecardAnswers.assessmentId, assessment.id)
					)
				);
			const byCriterion = new Map(existing.map((r) => [r.criterionId, r]));

			const written: AutoFillSuggestion[] = [];
			const skippedManual: string[] = [];
			const suggestedIds = new Set(suggestions.map((s) => s.criterion_id));
			const skippedNoEvidence = AUTO_FILL_CRITERION_IDS.filter(
				(id) => !suggestedIds.has(id)
			) as string[];

			const now = new Date();
			for (const suggestion of suggestions) {
				const prev = byCriterion.get(suggestion.criterion_id);
				if (prev?.source === 'manual') {
					skippedManual.push(suggestion.criterion_id);
					continue;
				}

				if (prev) {
					await db
						.update(scorecardAnswers)
						.set({
							score: suggestion.score,
							naDeclared: false,
							evidenceNote: suggestion.evidence_note,
							source: 'auto',
							answeredAt: now,
							updatedAt: now
						})
						.where(eq(scorecardAnswers.id, prev.id));
				} else {
					await db.insert(scorecardAnswers).values({
						tenantId,
						assessmentId: assessment.id,
						criterionId: suggestion.criterion_id,
						score: suggestion.score,
						naDeclared: false,
						evidenceNote: suggestion.evidence_note,
						source: 'auto',
						answeredAt: now
					});
				}
				written.push(suggestion);
			}

			return {
				assessment_id: assessment.id,
				written,
				skipped_manual: skippedManual,
				skipped_no_evidence: skippedNoEvidence
			};
		});
	}

	private async resolveAssessment(
		db: TenantDb,
		tenantId: string,
		assessmentId?: string
	) {
		if (assessmentId) {
			const [row] = await db
				.select()
				.from(scorecardAssessments)
				.where(
					and(
						eq(scorecardAssessments.id, assessmentId),
						eq(scorecardAssessments.tenantId, tenantId)
					)
				)
				.limit(1);
			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Assessment not found' }
				});
			}
			return row;
		}

		const [profile] = await db
			.select()
			.from(scorecardProfiles)
			.where(
				and(eq(scorecardProfiles.tenantId, tenantId), isNull(scorecardProfiles.archivedAt))
			)
			.limit(1);
		if (!profile) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'No active scorecard profile' }
			});
		}

		const [open] = await db
			.select()
			.from(scorecardAssessments)
			.where(
				and(
					eq(scorecardAssessments.tenantId, tenantId),
					eq(scorecardAssessments.profileId, profile.id),
					isNull(scorecardAssessments.completedAt)
				)
			)
			.limit(1);
		if (!open) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'No open assessment; start one first' }
			});
		}
		return open;
	}

	private async collectWithDb(
		db: TenantDb,
		tenantId: string
	): Promise<AutoFillSuggestion[]> {
		const lookback = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
		const out: AutoFillSuggestion[] = [];

		const [credRow] = await db
			.select({ n: count() })
			.from(tenantCredentials)
			.where(eq(tenantCredentials.tenantId, tenantId));
		const [keyRow] = await db
			.select({ n: count() })
			.from(apiKeys)
			.where(and(eq(apiKeys.tenantId, tenantId), isNull(apiKeys.revokedAt)));
		const [hookRow] = await db
			.select({ n: count() })
			.from(webhookSubscriptions)
			.where(
				and(eq(webhookSubscriptions.tenantId, tenantId), eq(webhookSubscriptions.active, true))
			);
		const connected =
			Number(credRow?.n ?? 0) + Number(keyRow?.n ?? 0) + Number(hookRow?.n ?? 0);
		const s24 = scoreConnectedSystems(connected);
		if (s24) out.push(s24);

		const [llmJob] = await db
			.select({ payload: jobs.payload })
			.from(jobs)
			.where(
				and(
					eq(jobs.tenantId, tenantId),
					eq(jobs.jobType, LLM_PARSE_JOB_TYPE),
					eq(jobs.status, 'completed')
				)
			)
			.orderBy(desc(jobs.completedAt), desc(jobs.createdAt))
			.limit(1);
		const payload = (llmJob?.payload ?? null) as Record<string, unknown> | null;
		const s32 = scoreLlmModelKnown(
			payload
				? {
						provider: typeof payload.provider === 'string' ? payload.provider : null,
						model: typeof payload.model === 'string' ? payload.model : null,
						path: typeof payload.path === 'string' ? payload.path : null
					}
				: null
		);
		if (s32) out.push(s32);

		const [corrRecent] = await db
			.select({ n: count() })
			.from(aiCorrections)
			.where(
				and(eq(aiCorrections.tenantId, tenantId), gte(aiCorrections.createdAt, lookback))
			);
		const s45 = scoreRecentCorrections(Number(corrRecent?.n ?? 0) > 0);
		if (s45) out.push(s45);

		const actorRows = await db
			.select({
				actor: sql<string>`coalesce(${auditLogs.actorId}::text, ${auditLogs.actorDisplayName})`,
				n: count()
			})
			.from(auditLogs)
			.where(and(eq(auditLogs.tenantId, tenantId), gte(auditLogs.createdAt, lookback)))
			.groupBy(sql`coalesce(${auditLogs.actorId}::text, ${auditLogs.actorDisplayName})`);
		const s46 = scoreKeyPersonRisk(
			actorRows.map((r) => ({ actor: r.actor, count: Number(r.n) }))
		);
		if (s46) out.push(s46);

		const [statusRow] = await db
			.select({
				approved: sql<number>`count(*) filter (where ${inboundMessages.status} = 'approved')`,
				ignored: sql<number>`count(*) filter (where ${inboundMessages.status} = 'ignored')`
			})
			.from(inboundMessages)
			.where(eq(inboundMessages.tenantId, tenantId));
		const approved = Number(statusRow?.approved ?? 0);
		const ignored = Number(statusRow?.ignored ?? 0);
		const s54 = scoreControlProportionality({ approved, ignored });
		if (s54) out.push(s54);

		const [corrAll] = await db
			.select({ n: count() })
			.from(aiCorrections)
			.where(eq(aiCorrections.tenantId, tenantId));
		const s72 = scoreCatchBadOutput({
			ignored,
			corrections: Number(corrAll?.n ?? 0)
		});
		if (s72) out.push(s72);

		const [disclosure] = await db
			.select({ value: tenantSettings.value })
			.from(tenantSettings)
			.where(
				and(
					eq(tenantSettings.tenantId, tenantId),
					eq(tenantSettings.key, WHATSAPP_AI_DISCLOSURE_KEY)
				)
			)
			.limit(1);
		if (disclosure) {
			const value = disclosure.value as { enabled?: unknown };
			const s76 = scoreAiDisclosure({
				known: true,
				enabled: value.enabled === true
			});
			if (s76) out.push(s76);
		}

		const [costRow] = await db
			.select({
				parseCount: count(),
				costMicros: sql<number>`coalesce(sum((${jobs.payload}->>'estimated_cost_usd_micros')::bigint), 0)`
			})
			.from(jobs)
			.where(
				and(
					eq(jobs.tenantId, tenantId),
					eq(jobs.jobType, LLM_PARSE_JOB_TYPE),
					eq(jobs.status, 'completed'),
					gte(jobs.createdAt, lookback)
				)
			);
		const s85 = scoreTcoHumanTime({
			parseCount: Number(costRow?.parseCount ?? 0),
			costMicros: Number(costRow?.costMicros ?? 0),
			decidedCount: approved + ignored
		});
		if (s85) out.push(s85);

		return out;
	}
}
