import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { WebhookSubscriptionCreate } from '@verimaya/shared';
import { outboxEvents, webhookSubscriptions } from '../db/schema';
import { CryptoService } from '../common/crypto.service';
import { toWebhookSubscription } from '../common/mappers';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { QueueService } from '../queue/queue.service';
import { OUTBOX_DELIVER_JOB_TYPE } from '../queue/queue.constants';

@Injectable()
export class WebhookSubscriptionsService {
	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly crypto: CryptoService,
		private readonly queue: QueueService
	) {}

	async list(tenantId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db
				.select()
				.from(webhookSubscriptions)
				.where(eq(webhookSubscriptions.tenantId, tenantId))
				.orderBy(desc(webhookSubscriptions.createdAt));

			return { items: rows.map(toWebhookSubscription) };
		});
	}

	async createWithDb(db: TenantDb, tenantId: string, input: WebhookSubscriptionCreate) {
		const secretCiphertext = this.crypto.encrypt(input.secret).toString('base64');

		const [row] = await db
			.insert(webhookSubscriptions)
			.values({
				tenantId,
				url: input.url,
				secretCiphertext,
				eventTypes: input.event_types
			})
			.returning();

		return toWebhookSubscription(row!);
	}

	async removeWithDb(db: TenantDb, tenantId: string, id: string) {
		const [row] = await db
			.select({ id: webhookSubscriptions.id })
			.from(webhookSubscriptions)
			.where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.tenantId, tenantId)))
			.limit(1);

		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Webhook subscription not found' }
			});
		}

		await db.delete(webhookSubscriptions).where(eq(webhookSubscriptions.id, id));
		return { id };
	}

	/**
	 * Fans an internal domain event out to every active subscription that
	 * listens for `eventType`, recording each delivery attempt in the
	 * `outbox_events` ledger (source of truth) before enqueuing a BullMQ job.
	 */
	async enqueueOutbound(
		tenantId: string,
		eventType: string,
		payload: Record<string, unknown>
	): Promise<{ enqueued: number }> {
		const outboxEventIds = await this.tenantContext.withTenant(tenantId, async ({ db }) =>
			this.insertOutboxRowsWithDb(db, tenantId, eventType, payload)
		);

		for (const outboxEventId of outboxEventIds) {
			await this.queue.enqueueDefaultJob(OUTBOX_DELIVER_JOB_TYPE, {
				jobId: outboxEventId,
				tenantId,
				jobType: OUTBOX_DELIVER_JOB_TYPE
			});
		}

		return { enqueued: outboxEventIds.length };
	}

	private async insertOutboxRowsWithDb(
		db: TenantDb,
		tenantId: string,
		eventType: string,
		payload: Record<string, unknown>
	): Promise<string[]> {
		const subscriptions = await db
			.select()
			.from(webhookSubscriptions)
			.where(
				and(eq(webhookSubscriptions.tenantId, tenantId), eq(webhookSubscriptions.active, true))
			);

		const matching = subscriptions.filter((sub) => sub.eventTypes.includes(eventType));
		if (matching.length === 0) {
			return [];
		}

		const rows = await db
			.insert(outboxEvents)
			.values(
				matching.map((sub) => ({
					tenantId,
					eventType,
					destinationUrl: sub.url,
					payload: { subscriptionId: sub.id, data: payload }
				}))
			)
			.returning({ id: outboxEvents.id });

		return rows.map((row) => row.id);
	}
}
