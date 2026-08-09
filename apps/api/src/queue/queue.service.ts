import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { AdMetricsSyncService } from '../ad-metrics/ad-metrics.sync.service';
import { DbService } from '../db/db.service';
import { jobs, tenants } from '../db/schema';
import { GhlReconcileService } from '../integrations/ghl/ghl.reconcile.service';
import {
	FILES_SWEEP_EVERY_MS,
	FILES_SWEEP_PENDING_JOB_TYPE,
	FilesSweepService
} from '../storage/files-sweep.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { InboundMessageProcessor } from '../whatsapp/inbound-message.processor';
import { IntegrationEventProcessor } from './integration-event.processor';
import { OutboxProcessor } from './outbox.processor';
import {
	AD_METRICS_SYNC_JOB_TYPE,
	DEFAULT_QUEUE_JOB_OPTIONS,
	ENABLE_INTEGRATION_SCHEDULERS_ENV,
	GHL_RECONCILE_JOB_TYPE,
	INBOUND_MESSAGE_PROCESS_JOB_TYPE,
	INTEGRATION_SCHEDULER_EVERY_MS,
	OUTBOX_DELIVER_JOB_TYPE
} from './queue.constants';

export const DEFAULT_QUEUE_NAME = 'default';

export type DefaultQueueJobData = {
	jobId: string;
	tenantId: string;
	jobType: string;
};

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(QueueService.name);
	private redis: Redis | null = null;
	private defaultQueue: Queue<DefaultQueueJobData> | null = null;
	private defaultWorker: Worker<DefaultQueueJobData> | null = null;

	constructor(
		private readonly config: ConfigService,
		private readonly db: DbService,
		private readonly tenantContext: TenantContextService,
		private readonly integrationEventProcessor: IntegrationEventProcessor,
		private readonly outboxProcessor: OutboxProcessor,
		private readonly ghlReconcileService: GhlReconcileService,
		private readonly adMetricsSyncService: AdMetricsSyncService,
		private readonly inboundMessageProcessor: InboundMessageProcessor,
		private readonly filesSweepService: FilesSweepService
	) {}

	async onModuleInit() {
		const url = this.config.getOrThrow<string>('REDIS_URL');
		this.redis = new Redis(url, { maxRetriesPerRequest: null });

		const queueConnection = this.redis.duplicate();
		this.defaultQueue = new Queue<DefaultQueueJobData>(DEFAULT_QUEUE_NAME, {
			connection: queueConnection,
			defaultJobOptions: DEFAULT_QUEUE_JOB_OPTIONS
		});

		const workerConnection = this.redis.duplicate();
		this.defaultWorker = new Worker<DefaultQueueJobData>(
			DEFAULT_QUEUE_NAME,
			async (job: Job<DefaultQueueJobData>) => {
				if (job.data.jobType === 'integration_event.process') {
					await this.integrationEventProcessor.process(job.data.jobId, job.data.tenantId);
					return { ok: true };
				}
				if (job.data.jobType === INBOUND_MESSAGE_PROCESS_JOB_TYPE) {
					await this.inboundMessageProcessor.process(job.data.jobId, job.data.tenantId);
					return { ok: true };
				}
				if (job.data.jobType === AD_METRICS_SYNC_JOB_TYPE) {
					const result = await this.adMetricsSyncService.sync(job.data.tenantId);
					return { ok: true, ...result };
				}
				if (job.data.jobType === GHL_RECONCILE_JOB_TYPE) {
					await this.ghlReconcileService.reconcile(job.data.tenantId);
					return { ok: true };
				}
				if (job.data.jobType === OUTBOX_DELIVER_JOB_TYPE) {
					await this.outboxProcessor.deliver(job.data.jobId, job.data.tenantId);
					return { ok: true };
				}
				if (job.data.jobType === FILES_SWEEP_PENDING_JOB_TYPE) {
					const result = await this.filesSweepService.sweepTenant(job.data.tenantId);
					return { ok: true, ...result };
				}
				this.logger.debug(`Noop worker handled job ${job.id} (${job.data.jobType})`);
				return { ok: true };
			},
			{ connection: workerConnection }
		);

		this.defaultWorker.on('failed', (job, err) => {
			if (!job) {
				this.logger.error(`Unknown job failed: ${err.message}`);
				return;
			}

			const maxAttempts = job.opts.attempts ?? DEFAULT_QUEUE_JOB_OPTIONS.attempts ?? 1;
			this.logger.error(
				`Job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${err.message}`
			);

			if (job.attemptsMade < maxAttempts) {
				return;
			}

			void this.handleExhaustedJob(job, err).catch((handleErr: unknown) => {
				const message = handleErr instanceof Error ? handleErr.message : String(handleErr);
				this.logger.error(`Failed to mark dead job ${job.id}: ${message}`);
			});
		});

		await this.registerIntegrationSchedulersIfEnabled();
	}

	getDefaultQueue(): Queue<DefaultQueueJobData> | null {
		return this.defaultQueue;
	}

	async pingRedis(): Promise<boolean> {
		if (!this.redis) {
			return false;
		}
		const response = await this.redis.ping();
		return response === 'PONG';
	}

	async enqueueDefaultJob(
		jobType: string,
		data: DefaultQueueJobData
	): Promise<Job<DefaultQueueJobData>> {
		if (!this.defaultQueue) {
			throw new Error('Default queue is not initialized');
		}
		return this.defaultQueue.add(jobType, data, {
			jobId: data.jobId
		});
	}

	/**
	 * Enqueues a one-shot `ad_metrics.sync` job for a tenant (fixture writer when no OAuth).
	 * Periodic cadence: see {@link registerIntegrationSchedulersIfEnabled}.
	 */
	async enqueueAdMetricsSync(tenantId: string): Promise<Job<DefaultQueueJobData>> {
		return this.enqueueDefaultJob(AD_METRICS_SYNC_JOB_TYPE, {
			jobId: randomUUID(),
			tenantId,
			jobType: AD_METRICS_SYNC_JOB_TYPE
		});
	}

	/**
	 * Enqueues a one-shot `ghl.reconcile` job for a tenant.
	 * Periodic cadence: see {@link registerIntegrationSchedulersIfEnabled}.
	 */
	async enqueueGhlReconcile(tenantId: string): Promise<Job<DefaultQueueJobData>> {
		return this.enqueueDefaultJob(GHL_RECONCILE_JOB_TYPE, {
			jobId: randomUUID(),
			tenantId,
			jobType: GHL_RECONCILE_JOB_TYPE
		});
	}

	/**
	 * Enqueues a one-shot `files.sweep_pending` job for a tenant.
	 * Periodic cadence: daily when {@link registerIntegrationSchedulersIfEnabled} is on.
	 */
	async enqueueFilesSweepPending(tenantId: string): Promise<Job<DefaultQueueJobData>> {
		return this.enqueueDefaultJob(FILES_SWEEP_PENDING_JOB_TYPE, {
			jobId: randomUUID(),
			tenantId,
			jobType: FILES_SWEEP_PENDING_JOB_TYPE
		});
	}

	/**
	 * Registers BullMQ repeatable job schedulers for each tenant:
	 * - `ghl.reconcile` + `ad_metrics.sync` every 6h
	 * - `files.sweep_pending` every 24h
	 *
	 * Only runs when `ENABLE_INTEGRATION_SCHEDULERS=true`. Safe default is off so local
	 * workers do not spam Redis. Manual enqueue via {@link enqueueGhlReconcile} /
	 * {@link enqueueAdMetricsSync} / {@link enqueueFilesSweepPending} always works.
	 */
	private async registerIntegrationSchedulersIfEnabled(): Promise<void> {
		const enabled =
			this.config.get<string>(ENABLE_INTEGRATION_SCHEDULERS_ENV)?.trim().toLowerCase() ===
			'true';
		// AUDIT-03 (Faz 8): warn loudly in production when schedulers are off — silent
		// failures here mean 6h GHL syncs never run. We do NOT fail startup because
		// local-dev environments intentionally skip schedulers; only prod gets the
		// reminder.
		if (!enabled) {
			const isProduction = (this.config.get<string>('NODE_ENV') ?? 'development') === 'production';
			if (isProduction) {
				this.logger.warn(
					`AUDIT-03: ${ENABLE_INTEGRATION_SCHEDULERS_ENV} is not 'true' in production — ` +
						'ghl.reconcile, ad_metrics.sync, files.sweep_pending will NOT run on a schedule. ' +
						'Set the env var or wire manual enqueue.'
				);
			} else {
				this.logger.log(
					`Integration schedulers skipped (${ENABLE_INTEGRATION_SCHEDULERS_ENV}!=true). Use enqueueGhlReconcile / enqueueAdMetricsSync / enqueueFilesSweepPending for one-shot runs.`
				);
			}
			return;
		}

		if (!this.defaultQueue) {
			this.logger.warn('Cannot register integration schedulers: default queue not ready');
			return;
		}

		const tenantRows = await this.db.client.select({ id: tenants.id }).from(tenants);
		if (tenantRows.length === 0) {
			this.logger.log('Integration schedulers enabled but no tenants found; nothing registered');
			return;
		}

		for (const { id: tenantId } of tenantRows) {
			await this.defaultQueue.upsertJobScheduler(
				`${GHL_RECONCILE_JOB_TYPE}:${tenantId}`,
				{ every: INTEGRATION_SCHEDULER_EVERY_MS },
				{
					name: GHL_RECONCILE_JOB_TYPE,
					data: {
						jobId: `${GHL_RECONCILE_JOB_TYPE}:${tenantId}`,
						tenantId,
						jobType: GHL_RECONCILE_JOB_TYPE
					}
				}
			);
			await this.defaultQueue.upsertJobScheduler(
				`${AD_METRICS_SYNC_JOB_TYPE}:${tenantId}`,
				{ every: INTEGRATION_SCHEDULER_EVERY_MS },
				{
					name: AD_METRICS_SYNC_JOB_TYPE,
					data: {
						jobId: `${AD_METRICS_SYNC_JOB_TYPE}:${tenantId}`,
						tenantId,
						jobType: AD_METRICS_SYNC_JOB_TYPE
					}
				}
			);
			await this.defaultQueue.upsertJobScheduler(
				`${FILES_SWEEP_PENDING_JOB_TYPE}:${tenantId}`,
				{ every: FILES_SWEEP_EVERY_MS },
				{
					name: FILES_SWEEP_PENDING_JOB_TYPE,
					data: {
						jobId: `${FILES_SWEEP_PENDING_JOB_TYPE}:${tenantId}`,
						tenantId,
						jobType: FILES_SWEEP_PENDING_JOB_TYPE
					}
				}
			);
		}

		this.logger.log(
			`Registered schedulers for ${tenantRows.length} tenant(s) (ghl.reconcile + ad_metrics.sync 6h; files.sweep_pending 24h)`
		);
	}

	private async handleExhaustedJob(job: Job<DefaultQueueJobData>, err: Error): Promise<void> {
		if (job.data.jobType === OUTBOX_DELIVER_JOB_TYPE) {
			// Intermediate attempts leave status='failed'; exhaustion → 'dead'.
			await this.outboxProcessor.markDead(job.data.jobId, job.data.tenantId, err.message);
			this.logger.error(`Outbox delivery ${job.data.jobId} exhausted retries: ${err.message}`);
			return;
		}
		if (
			job.data.jobType === GHL_RECONCILE_JOB_TYPE ||
			job.data.jobType === AD_METRICS_SYNC_JOB_TYPE ||
			job.data.jobType === FILES_SWEEP_PENDING_JOB_TYPE
		) {
			await this.markScheduledJobDead(job, err);
			this.logger.error(
				`Scheduled job ${job.data.jobType} for tenant ${job.data.tenantId} exhausted retries: ${err.message}`
			);
			return;
		}
		await this.integrationEventProcessor.markFailed(
			job.data.jobId,
			job.data.tenantId,
			err.message,
			job.attemptsMade
		);
	}

	/**
	 * AUDIT-F09-05: schedulers historically only logged on exhaustion (silent loss).
	 * Write / update the durable `jobs` ledger with status='dead'. Prefer update by
	 * bullmq_job_id when a row already exists so we never double-insert.
	 */
	async markScheduledJobDead(job: Job<DefaultQueueJobData>, err: Error): Promise<void> {
		const now = new Date();
		const bullmqJobId = job.id != null ? String(job.id) : null;

		await this.tenantContext.withTenant(job.data.tenantId, async ({ db }) => {
			if (bullmqJobId) {
				const [existing] = await db
					.select()
					.from(jobs)
					.where(
						and(eq(jobs.tenantId, job.data.tenantId), eq(jobs.bullmqJobId, bullmqJobId))
					)
					.limit(1);

				if (existing) {
					await db
						.update(jobs)
						.set({
							status: 'dead',
							lastError: err.message,
							attempts: job.attemptsMade,
							updatedAt: now,
							completedAt: existing.completedAt ?? now
						})
						.where(eq(jobs.id, existing.id));
					return;
				}
			}

			await db.insert(jobs).values({
				tenantId: job.data.tenantId,
				queue: DEFAULT_QUEUE_NAME,
				jobType: job.data.jobType,
				payload: {
					source: 'scheduler_exhausted',
					bull_job_id: job.data.jobId
				},
				status: 'dead',
				bullmqJobId,
				attempts: job.attemptsMade,
				lastError: err.message,
				startedAt: job.processedOn ? new Date(job.processedOn) : null,
				completedAt: now
			});
		});
	}

	async onModuleDestroy() {
		await this.defaultWorker?.close();
		await this.defaultQueue?.close();
		if (this.redis) {
			await this.redis.quit();
		}
		this.defaultWorker = null;
		this.defaultQueue = null;
		this.redis = null;
	}
}
