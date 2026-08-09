import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { outboxEvents, webhookSubscriptions } from '../db/schema';
import { CryptoService } from '../common/crypto.service';
import { TenantContextService } from '../tenant/tenant-context.service';

const SIGNATURE_HEADER = 'x-verimaya-signature';
const EVENT_TYPE_HEADER = 'x-verimaya-event-type';

type OutboxPayload = {
	subscriptionId?: string;
	data?: unknown;
};

/**
 * Delivers `outbox_events` rows to their destination URL with an HMAC
 * signature. `outbox_events` remains the auditable source of truth; BullMQ
 * only drives retries (queue-first outbound webhook pattern, Faz 6).
 *
 * AUDIT-F09-05: intermediate delivery failures leave `status='failed'`;
 * exhaustion is marked `status='dead'` via {@link markDead} from the worker
 * failed-handler (not here) so "still retrying" vs "given up" stay distinct.
 */
@Injectable()
export class OutboxProcessor {
	private readonly logger = new Logger(OutboxProcessor.name);

	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly crypto: CryptoService
	) {}

	async deliver(outboxEventId: string, tenantId: string): Promise<void> {
		const event = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db
				.select()
				.from(outboxEvents)
				.where(eq(outboxEvents.id, outboxEventId))
				.limit(1);
			return row ?? null;
		});

		if (!event) {
			this.logger.warn(`Outbox event ${outboxEventId} not found; skipping delivery`);
			return;
		}

		const payload = event.payload as OutboxPayload;
		const secret = await this.resolveSecret(tenantId, payload.subscriptionId);
		const body = JSON.stringify(payload.data ?? {});
		const signature = createHmac('sha256', secret).update(body).digest('hex');

		let deliveryError: string | null = null;
		try {
			const response = await fetch(event.destinationUrl, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					[SIGNATURE_HEADER]: `sha256=${signature}`,
					[EVENT_TYPE_HEADER]: event.eventType
				},
				body
			});
			if (!response.ok) {
				deliveryError = `HTTP ${response.status}`;
			}
		} catch (err) {
			deliveryError = err instanceof Error ? err.message : String(err);
		}

		const now = new Date();
		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db
				.update(outboxEvents)
				.set(
					deliveryError
						? {
								status: 'failed',
								lastError: deliveryError,
								attempts: event.attempts + 1,
								updatedAt: now
							}
						: { status: 'sent', sentAt: now, updatedAt: now }
				)
				.where(eq(outboxEvents.id, outboxEventId));
		});

		if (deliveryError) {
			throw new Error(`Outbox delivery ${outboxEventId} failed: ${deliveryError}`);
		}
	}

	/** Terminal DLQ mark after BullMQ attempts are exhausted. */
	async markDead(outboxEventId: string, tenantId: string, lastError?: string): Promise<void> {
		const now = new Date();
		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db
				.select()
				.from(outboxEvents)
				.where(eq(outboxEvents.id, outboxEventId))
				.limit(1);
			if (!row) {
				this.logger.warn(`Outbox event ${outboxEventId} not found; cannot mark dead`);
				return;
			}

			await db
				.update(outboxEvents)
				.set({
					status: 'dead',
					deadLetteredAt: now,
					lastError: lastError ?? row.lastError,
					updatedAt: now
				})
				.where(eq(outboxEvents.id, outboxEventId));
		});
	}

	private async resolveSecret(tenantId: string, subscriptionId: string | undefined): Promise<string> {
		if (!subscriptionId) return '';

		const subscription = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db
				.select({ secretCiphertext: webhookSubscriptions.secretCiphertext })
				.from(webhookSubscriptions)
				.where(eq(webhookSubscriptions.id, subscriptionId))
				.limit(1);
			return row ?? null;
		});

		if (!subscription) return '';
		return this.crypto.decrypt(Buffer.from(subscription.secretCiphertext, 'base64'));
	}
}
