import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

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

	constructor(private readonly config: ConfigService) {}

	onModuleInit() {
		const url = this.config.getOrThrow<string>('REDIS_URL');
		this.redis = new Redis(url, { maxRetriesPerRequest: null });

		const queueConnection = this.redis.duplicate();
		this.defaultQueue = new Queue<DefaultQueueJobData>(DEFAULT_QUEUE_NAME, {
			connection: queueConnection
		});

		const workerConnection = this.redis.duplicate();
		this.defaultWorker = new Worker<DefaultQueueJobData>(
			DEFAULT_QUEUE_NAME,
			async (job: Job<DefaultQueueJobData>) => {
				this.logger.debug(`Noop worker handled job ${job.id} (${job.data.jobType})`);
				return { ok: true };
			},
			{ connection: workerConnection }
		);

		this.defaultWorker.on('failed', (job, err) => {
			this.logger.error(`Job ${job?.id ?? 'unknown'} failed: ${err.message}`);
		});
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
