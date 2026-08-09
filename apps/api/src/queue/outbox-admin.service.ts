import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { outboxEvents, tenants } from '../db/schema';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { OUTBOX_DELIVER_JOB_TYPE } from './queue.constants';
import { QueueService } from './queue.service';

export type DeadOutboxRow = {
	id: string;
	tenant_id: string;
	event_type: string;
	destination_url: string;
	status: string;
	attempts: number;
	last_error: string | null;
	dead_lettered_at: string | null;
	scheduled_at: string;
	updated_at: string;
};

export type RequeueOutboxBody = {
	tenant_id?: string;
	ids?: string[];
	limit?: number;
};

const DEFAULT_DEAD_LIST_LIMIT = 50;
const MAX_DEAD_LIST_LIMIT = 200;
const DEFAULT_REQUEUE_LIMIT = 50;
const MAX_REQUEUE_LIMIT = 200;

/**
 * AUDIT-F09-05: operator tools for outbox DLQ — list `status='dead'` rows and
 * requeue them to `pending` (attempts preserved) via the same BullMQ path as
 * first delivery.
 */
@Injectable()
export class OutboxAdminService {
	private readonly logger = new Logger(OutboxAdminService.name);

	constructor(
		private readonly db: DbService,
		private readonly tenantContext: TenantContextService,
		private readonly queue: QueueService
	) {}

	async listDead(limitRaw?: number, tenantId?: string): Promise<{ items: DeadOutboxRow[] }> {
		const limit = clampLimit(limitRaw, DEFAULT_DEAD_LIST_LIMIT, MAX_DEAD_LIST_LIMIT);
		const tenantIds = tenantId ? [tenantId] : await this.allTenantIds();
		const items: DeadOutboxRow[] = [];

		for (const id of tenantIds) {
			if (items.length >= limit) break;
			const remaining = limit - items.length;
			const rows = await this.tenantContext.withTenant(id, async ({ db }) =>
				db
					.select()
					.from(outboxEvents)
					.where(eq(outboxEvents.status, 'dead'))
					.orderBy(desc(outboxEvents.deadLetteredAt), desc(outboxEvents.updatedAt))
					.limit(remaining)
			);
			for (const row of rows) {
				items.push(toDeadRow(row));
			}
		}

		return { items };
	}

	async requeue(body: RequeueOutboxBody): Promise<{ requeued: number; ids: string[] }> {
		const limit = clampLimit(body.limit, DEFAULT_REQUEUE_LIMIT, MAX_REQUEUE_LIMIT);
		const idsFilter =
			body.ids && body.ids.length > 0 ? [...new Set(body.ids.filter((id) => id.length > 0))] : null;

		const tenantIds = body.tenant_id ? [body.tenant_id] : await this.allTenantIds();
		const requeuedIds: string[] = [];

		for (const tenantId of tenantIds) {
			if (requeuedIds.length >= limit) break;
			const remaining = limit - requeuedIds.length;

			const candidates = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
				const conditions = [eq(outboxEvents.status, 'dead')];
				if (idsFilter) {
					conditions.push(inArray(outboxEvents.id, idsFilter));
				}
				return db
					.select({ id: outboxEvents.id, attempts: outboxEvents.attempts })
					.from(outboxEvents)
					.where(and(...conditions))
					.orderBy(desc(outboxEvents.deadLetteredAt))
					.limit(remaining);
			});

			if (candidates.length === 0) continue;

			/*
			 * Enqueue BEFORE flipping status, one row at a time. If the enqueue fails (queue
			 * down, or a same-id job still locked in the worker) the row stays `dead` — it is
			 * still visible in the DLQ and can be retried. The reverse order would leave rows
			 * sitting in `pending` with no job behind them, i.e. silently lost again, which is
			 * the exact failure this task exists to close.
			 */
			const enqueued: string[] = [];
			for (const candidate of candidates) {
				try {
					await this.enqueueDelivery(candidate.id, tenantId);
				} catch (err: unknown) {
					const message = err instanceof Error ? err.message : String(err);
					this.logger.error(
						`Requeue skipped for dead outbox event ${candidate.id} (tenant ${tenantId}): ${message}`
					);
					continue;
				}
				enqueued.push(candidate.id);
			}

			if (enqueued.length === 0) continue;

			const now = new Date();
			await this.tenantContext.withTenant(tenantId, async ({ db }) => {
				await db
					.update(outboxEvents)
					.set({
						status: 'pending',
						deadLetteredAt: null,
						scheduledAt: now,
						updatedAt: now
						// attempts intentionally preserved — exhaustion history must remain visible
					})
					.where(and(eq(outboxEvents.status, 'dead'), inArray(outboxEvents.id, enqueued)));
			});

			requeuedIds.push(...enqueued);
			this.logger.log(
				`Requeued ${enqueued.length}/${candidates.length} dead outbox event(s) for tenant ${tenantId}`
			);
		}

		return { requeued: requeuedIds.length, ids: requeuedIds };
	}

	private async enqueueDelivery(outboxEventId: string, tenantId: string): Promise<void> {
		const queue = this.queue.getDefaultQueue();
		if (!queue) {
			throw new Error('Default queue is not initialized');
		}

		/*
		 * BullMQ dedupes by jobId: `add` with an id that already exists is a silent no-op,
		 * which would make requeue report success while nothing runs. Remove the stale job
		 * first; a locked (currently executing) job cannot be removed, and that throw is
		 * what keeps the row in `dead` instead of being falsely counted as requeued.
		 */
		const existing = await queue.getJob(outboxEventId);
		if (existing) {
			await existing.remove();
		}

		await this.queue.enqueueDefaultJob(OUTBOX_DELIVER_JOB_TYPE, {
			jobId: outboxEventId,
			tenantId,
			jobType: OUTBOX_DELIVER_JOB_TYPE
		});
	}

	private async allTenantIds(): Promise<string[]> {
		const rows = await this.db.client.select({ id: tenants.id }).from(tenants);
		return rows.map((r) => r.id);
	}
}

function clampLimit(raw: number | undefined, fallback: number, max: number): number {
	if (raw === undefined || Number.isNaN(raw) || raw < 1) return fallback;
	return Math.min(Math.floor(raw), max);
}

function toDeadRow(row: typeof outboxEvents.$inferSelect): DeadOutboxRow {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		event_type: row.eventType,
		destination_url: row.destinationUrl,
		status: row.status,
		attempts: row.attempts,
		last_error: row.lastError,
		dead_lettered_at: row.deadLetteredAt?.toISOString() ?? null,
		scheduled_at: row.scheduledAt.toISOString(),
		updated_at: row.updatedAt.toISOString()
	};
}
