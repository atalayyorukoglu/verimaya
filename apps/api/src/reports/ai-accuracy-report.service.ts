import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
	AI_ACCURACY_UNANSWERED_SAMPLE_LIMIT,
	mayaAnswerSchema,
	mayaToolNameSchema,
	recordUpdateSuggestionFieldSchema,
	type AiAccuracyReport,
	type AiAccuracyReportParams,
	type AiDraftAccuracy,
	type AiMayaAccuracy,
	type AiSuggestionsAccuracy
} from '@verimaya/shared';
import { mayaQuestions, recordUpdateSuggestions, transactions } from '../db/schema';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { computeAiCorrectionsFieldReport } from '../whatsapp/ai-corrections.service';

/** Inclusive UTC calendar-day filter on `column` — same semantics as AiCorrectionsService.report. */
function periodConditions(column: AnyPgColumn, from?: string, to?: string): SQL[] {
	const out: SQL[] = [];
	if (from) out.push(sql`${column} >= ${from}::date`);
	if (to) out.push(sql`${column} < (${to}::date + interval '1 day')`);
	return out;
}

/**
 * AI-03 — isabet ölçümü. Üç kaynağı (`ai_corrections`, `record_update_suggestions`,
 * `maya_questions`) tek raporda birleştirir. **Yalnız ölçer**; otomatik prompt
 * beslemesi yok (bkz. docs/2026-08-11-YAPILACAKLAR.md "AI-03 kapsam daraltması").
 */
@Injectable()
export class AiAccuracyReportService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async get(tenantId: string, params: AiAccuracyReportParams): Promise<AiAccuracyReport> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			// Sequential (not Promise.all) — a tenant-scoped `db` isn't always a real
			// transaction in tests (session-pinned doubles); concurrent queries can
			// hop to a different pool connection that never saw `set_config`. See
			// the same note in AiCorrectionsService.computeAiCorrectionsFieldReport.
			const drafts = await this.draftAccuracy(db, params);
			const suggestions = await this.suggestionsAccuracy(db, params);
			const maya = await this.mayaAccuracy(db, params);

			return {
				period: { from: params.from ?? null, to: params.to ?? null },
				drafts,
				suggestions,
				maya
			};
		});
	}

	/**
	 * "AI ne kadar isabetli?" — payda `transactions.source_inbound_message_id`
	 * (onay anı), pay `ai_corrections.corrected_message_count`; ikisi de aynı DB
	 * transaction'ında yazılır (approveDraftsWithDb, MONEY-01) → zaman tabanı tutarlı.
	 * "Nerede yanılıyor?" (1/2) — `by_field` zaten alan + AI-09 güven kırılımı taşıyor.
	 */
	private async draftAccuracy(db: TenantDb, params: AiAccuracyReportParams): Promise<AiDraftAccuracy> {
		const { items, corrected_message_count } = await computeAiCorrectionsFieldReport(db, params);

		const approvedRows = await db
			.select({ n: sql<number>`count(distinct ${transactions.sourceInboundMessageId})::int` })
			.from(transactions)
			.where(
				and(
					isNotNull(transactions.sourceInboundMessageId),
					isNull(transactions.deletedAt),
					...periodConditions(transactions.createdAt, params.from, params.to)
				)
			);
		const approved_message_count = Number(approvedRows[0]?.n ?? 0);
		const unchanged_rate =
			approved_message_count > 0 ? 1 - corrected_message_count / approved_message_count : null;

		return {
			approved_message_count,
			corrected_message_count,
			unchanged_rate,
			by_field: items
		};
	}

	/**
	 * "Nerede yanılıyor?" (2/2) — `record_update_suggestions` kabul oranı + red
	 * gerekçesi dağılımı. `pending` kararsız olduğundan `acceptance_rate` paydasına
	 * girmez. Dönem `created_at` üzerinden (karar tarihi değil — bkz. AI-03 raporu).
	 */
	private async suggestionsAccuracy(
		db: TenantDb,
		params: AiAccuracyReportParams
	): Promise<AiSuggestionsAccuracy> {
		const statusRows = await db
			.select({
				field: recordUpdateSuggestions.field,
				status: recordUpdateSuggestions.status,
				n: sql<number>`count(*)::int`
			})
			.from(recordUpdateSuggestions)
			.where(
				and(
					isNull(recordUpdateSuggestions.deletedAt),
					...periodConditions(recordUpdateSuggestions.createdAt, params.from, params.to)
				)
			)
			.groupBy(recordUpdateSuggestions.field, recordUpdateSuggestions.status);

		let approved = 0;
		let rejected = 0;
		let pending = 0;
		const byField = new Map<string, { approved: number; rejected: number }>();
		for (const row of statusRows) {
			const n = Number(row.n);
			const bucket = byField.get(row.field) ?? { approved: 0, rejected: 0 };
			if (row.status === 'approved') {
				approved += n;
				bucket.approved += n;
			} else if (row.status === 'rejected') {
				rejected += n;
				bucket.rejected += n;
			} else if (row.status === 'pending') {
				pending += n;
			}
			byField.set(row.field, bucket);
		}
		const decided = approved + rejected;
		const acceptance_rate = decided > 0 ? approved / decided : null;

		const reasonRows = await db
			.select({
				reason: recordUpdateSuggestions.rejectReason,
				n: sql<number>`count(*)::int`
			})
			.from(recordUpdateSuggestions)
			.where(
				and(
					eq(recordUpdateSuggestions.status, 'rejected'),
					isNull(recordUpdateSuggestions.deletedAt),
					...periodConditions(recordUpdateSuggestions.createdAt, params.from, params.to)
				)
			)
			.groupBy(recordUpdateSuggestions.rejectReason)
			.orderBy(desc(sql`count(*)`))
			.limit(10);

		return {
			total: approved + rejected + pending,
			approved,
			rejected,
			pending,
			acceptance_rate,
			by_field: [...byField.entries()].map(([field, v]) => ({
				field: recordUpdateSuggestionFieldSchema.parse(field),
				approved: v.approved,
				rejected: v.rejected
			})),
			reject_reasons: reasonRows.map((r) => ({ reason: r.reason, count: Number(r.n) }))
		};
	}

	/**
	 * "Maya neyi bilmiyor?" — cevaplanamayan soru oranı + `unanswered_samples`
	 * (maskeli metin, PII yok). Panel bunu "bilgi bankana şunu ekle" yönlendirmesi
	 * olarak gösterir — insan kapılı, otomatik prompt beslemesi değil.
	 */
	private async mayaAccuracy(db: TenantDb, params: AiAccuracyReportParams): Promise<AiMayaAccuracy> {
		const rows = await db
			.select({
				answered: mayaQuestions.answered,
				source: mayaQuestions.source,
				tool: mayaQuestions.tool,
				n: sql<number>`count(*)::int`
			})
			.from(mayaQuestions)
			.where(and(...periodConditions(mayaQuestions.createdAt, params.from, params.to)))
			.groupBy(mayaQuestions.answered, mayaQuestions.source, mayaQuestions.tool);

		let answered = 0;
		let unanswered = 0;
		const bySource = new Map<string, number>();
		const byTool = new Map<string, number>();
		for (const row of rows) {
			const n = Number(row.n);
			if (row.answered) answered += n;
			else unanswered += n;
			bySource.set(row.source, (bySource.get(row.source) ?? 0) + n);
			if (row.tool) byTool.set(row.tool, (byTool.get(row.tool) ?? 0) + n);
		}
		const total = answered + unanswered;
		const answer_rate = total > 0 ? answered / total : null;

		const unansweredRows = await db
			.select({
				questionMasked: mayaQuestions.questionMasked,
				createdAt: mayaQuestions.createdAt
			})
			.from(mayaQuestions)
			.where(
				and(
					eq(mayaQuestions.answered, false),
					...periodConditions(mayaQuestions.createdAt, params.from, params.to)
				)
			)
			.orderBy(desc(mayaQuestions.createdAt))
			.limit(AI_ACCURACY_UNANSWERED_SAMPLE_LIMIT);

		return {
			total,
			answered,
			unanswered,
			answer_rate,
			by_source: [...bySource.entries()].map(([source, count]) => ({
				source: mayaAnswerSchema.shape.source.parse(source),
				count
			})),
			by_tool: [...byTool.entries()].map(([tool, count]) => ({
				tool: mayaToolNameSchema.parse(tool),
				count
			})),
			unanswered_samples: unansweredRows.map((r) => ({
				question_masked: r.questionMasked,
				created_at: r.createdAt.toISOString()
			}))
		};
	}
}
