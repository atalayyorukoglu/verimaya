import type { JobsOptions } from 'bullmq';

/** Job type for outbound webhook delivery (outbox pattern, Faz 6). */
export const OUTBOX_DELIVER_JOB_TYPE = 'outbox.deliver';

/** Job type for the 6h incremental Meta/Google Ads sync (Faz 5). */
export const AD_METRICS_SYNC_JOB_TYPE = 'ad_metrics.sync';

/** Job type for periodic GHL reconciliation (Faz 4; intended cadence: every 6h per tenant). */
export const GHL_RECONCILE_JOB_TYPE = 'ghl.reconcile';

/** Durable ledger job type written by GHL inbound processing (sync audit trail, no migration). */
export const GHL_INBOUND_SYNC_LOG_JOB_TYPE = 'ghl.inbound.sync';

/** WAHA inbound → parse drafts (queue-first; same logic as POST /whatsapp/inbox/process). */
export const INBOUND_MESSAGE_PROCESS_JOB_TYPE = 'inbound_message.process';

/** 6h cadence for per-tenant integration schedulers (ms). */
export const INTEGRATION_SCHEDULER_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Env flag that enables BullMQ repeatable schedulers for `ghl.reconcile` and
 * `ad_metrics.sync` (one scheduler id per tenant). Default off so local/dev
 * workers do not spam Redis with 6h ticks.
 */
export const ENABLE_INTEGRATION_SCHEDULERS_ENV = 'ENABLE_INTEGRATION_SCHEDULERS';

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
