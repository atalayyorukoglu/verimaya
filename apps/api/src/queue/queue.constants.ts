import type { JobsOptions } from 'bullmq';

/** Job type for outbound webhook delivery (outbox pattern, Faz 6). */
export const OUTBOX_DELIVER_JOB_TYPE = 'outbox.deliver';

/** Job type for the 6h incremental Meta/Google Ads sync (Faz 5 — noop until OAuth adapters ship). */
export const AD_METRICS_SYNC_JOB_TYPE = 'ad_metrics.sync';

/** Job type for periodic GHL reconciliation (Faz 4 — noop until the GHL adapter ships; intended cadence: every 6h per tenant with an active credential). */
export const GHL_RECONCILE_JOB_TYPE = 'ghl.reconcile';

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
