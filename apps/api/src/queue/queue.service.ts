import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { IntegrationEventProcessor } from './integration-event.processor';
import { DEFAULT_QUEUE_JOB_OPTIONS } from './queue.constants';

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
		private readonly integrationEventProcessor: IntegrationEventProcessor
	) {}

	onModuleInit() {
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
				if (job.data.jobType === 'ad_metrics.sync') {
					// Faz 5 stub: scheduled Meta/Google incremental sync (6h) → ad_metrics_daily; noop until OAuth adapters ship.
					this.logger.debug(
						`Ad metrics sync noop for tenant ${job.data.tenantId}; job ${job.id}`
					);
					return { ok: true };
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

	private async handleExhaustedJob(job: Job<DefaultQueueJobData>, err: Error): Promise<void> {
		await this.integrationEventProcessor.markFailed(
			job.data.jobId,
			job.data.tenantId,
			err.message,
			job.attemptsMade
		);
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
