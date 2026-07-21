import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { inboundMessages } from '../db/schema/inbound-messages';
import { PatientsService } from '../patients/patients.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { heuristicParseWhatsappMessage } from './heuristic-parse';
import { toInboundMessage } from './inbound-mapper';

@Injectable()
export class WhatsappService {
	constructor(
		private readonly patientsService: PatientsService,
		private readonly tenantContext: TenantContextService
	) {}

	async parseMessage(tenantId: string, message: string) {
		const { items: patients } = await this.patientsService.list(tenantId, {
			limit: 100
		});
		return heuristicParseWhatsappMessage(message, patients);
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
			const [row] = await db
				.select()
				.from(inboundMessages)
				.where(eq(inboundMessages.id, id))
				.limit(1);

			if (!row) {
				throw new NotFoundException('Inbound message not found');
			}

			return toInboundMessage(row);
		});
	}
}
