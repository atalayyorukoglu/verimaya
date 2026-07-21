import type { JobsOptions } from 'bullmq';

/** Default BullMQ job options for the `default` queue. */
export const DEFAULT_QUEUE_JOB_OPTIONS: JobsOptions = {
	attempts: 5,
	backoff: {
		type: 'exponential',
		delay: 1000
	},
	removeOnComplete: {
		count: 1000
	},
	removeOnFail: {
		count: 5000
	}
};
