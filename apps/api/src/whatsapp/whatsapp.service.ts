import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type {
	InboundMessageActionResponse,
	InboundMessageProcessResponse,
	InboundMessageStatus,
	TransactionDraft
} from '@verimaya/shared';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { inboundMessages, type InboundMessageRow } from '../db/schema/inbound-messages';
import { LLM_CLIENT, type LlmClient } from '../integrations/llm';
import { PatientsService } from '../patients/patients.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { asRecord, extractInboundDisplayFields, mergeParsedPayload, toInboundMessage } from './inbound-mapper';

const PARSE_ERROR_NO_TEXT = 'Medya mesajı — metin yok';
const PARSE_ERROR_NO_MATCH = 'Ayrıştırılamadı';

@Injectable()
export class WhatsappService {
	constructor(
		private readonly patientsService: PatientsService,
		private readonly tenantContext: TenantContextService,
		@Inject(LLM_CLIENT) private readonly llm: LlmClient
	) {}

	async parseMessage(tenantId: string, message: string) {
		const { items: patients } = await this.patientsService.list(tenantId, {
			limit: 100
		});
		return this.llm.parseTransactionDrafts({ message, patients });
	}

	async listInbox(tenantId: string, params: { cursor?: string; limit: number }) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const cursorCond = createdAtCursorCondition(
				inboundMessages.createdAt,
				inboundMessages.id,
				params.cursor
			);
			const rows = await db
				.select()
				.from(inboundMessages)
				.where(cursorCond)
				.orderBy(desc(inboundMessages.createdAt), desc(inboundMessages.id))
				.limit(params.limit + 1);

			const page = buildCursorPage(rows, params.limit);
			return {
				messages: page.items.map(toInboundMessage),
				next_cursor: page.next_cursor
			};
		});
	}

	async getInboxItem(tenantId: string, id: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const row = await this.findRow(db, id);
			return toInboundMessage(row);
		});
	}

	/** LLM/heuristic parse of a single inbox item; stashes drafts (or an error) into `payload`. */
	async parseInboxItem(tenantId: string, id: string): Promise<{ records: TransactionDraft[] }> {
		const { items: patients } = await this.patientsService.list(tenantId, { limit: 100 });

		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const row = await this.findRow(db, id);
			const payload = asRecord(row.payload) ?? {};
			const display = extractInboundDisplayFields(payload);

			if (!display.body?.trim()) {
				await this.savePayload(db, id, payload, { parsed_records: null, parse_error: PARSE_ERROR_NO_TEXT });
				return { records: [] };
			}

			const records = await this.llm.parseTransactionDrafts({
				message: display.body,
				patients
			});
			await this.savePayload(db, id, payload, {
				parsed_records: records.length > 0 ? records : null,
				parse_error: records.length === 0 ? PARSE_ERROR_NO_MATCH : null
			});
			return { records };
		});
	}

	/** Parse every `new` message with text; skips media-only messages. Does not create transactions. */
	async processInbox(tenantId: string): Promise<InboundMessageProcessResponse> {
		const { items: patients } = await this.patientsService.list(tenantId, { limit: 100 });

		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db
				.select()
				.from(inboundMessages)
				.where(eq(inboundMessages.status, 'new'));

			let processed = 0;
			let parsed = 0;
			let error = 0;

			for (const row of rows) {
				const payload = asRecord(row.payload) ?? {};
				const display = extractInboundDisplayFields(payload);
				if (!display.body?.trim()) continue;

				processed++;
				const records = await this.llm.parseTransactionDrafts({
					message: display.body,
					patients
				});
				const isError = records.length === 0;
				if (isError) error++;
				else parsed++;

				await this.savePayload(db, row.id, payload, {
					parsed_records: isError ? null : records,
					parse_error: isError ? PARSE_ERROR_NO_MATCH : null
				});
			}

			return { processed, parsed, error };
		});
	}

	/** Marks inbox item approved only — does not auto-create transactions (POST /v1/transactions). */
	async approveInboxItem(tenantId: string, id: string): Promise<InboundMessageActionResponse> {
		return this.setStatus(tenantId, id, 'approved');
	}

	async ignoreInboxItem(tenantId: string, id: string): Promise<InboundMessageActionResponse> {
		return this.setStatus(tenantId, id, 'ignored');
	}

	private async setStatus(
		tenantId: string,
		id: string,
		status: InboundMessageStatus
	): Promise<InboundMessageActionResponse> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await this.findRow(db, id);
			await db.update(inboundMessages).set({ status }).where(eq(inboundMessages.id, id));
			return { success: true, id, status };
		});
	}

	private async savePayload(
		db: TenantDb,
		id: string,
		payload: Record<string, unknown>,
		patch: { parsed_records: TransactionDraft[] | null; parse_error: string | null }
	) {
		await db
			.update(inboundMessages)
			.set({ status: 'parsed', payload: mergeParsedPayload(payload, patch) })
			.where(eq(inboundMessages.id, id));
	}

	private async findRow(db: TenantDb, id: string): Promise<InboundMessageRow> {
		const [row] = await db.select().from(inboundMessages).where(eq(inboundMessages.id, id)).limit(1);

		if (!row) {
			throw new NotFoundException('Inbound message not found');
		}

		return row;
	}
}
