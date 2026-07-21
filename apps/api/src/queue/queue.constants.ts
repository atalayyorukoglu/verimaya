import type { JobsOptions } from 'bullmq';

/** Job type for outbound webhook delivery (outbox pattern, Faz 6). */
export const OUTBOX_DELIVER_JOB_TYPE = 'outbox.deliver';

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
