import * as Sentry from '@sentry/node';

let enabled = false;

/** Initialize Sentry when `SENTRY_DSN` is set; otherwise leave as no-op. */
export function initSentry(): void {
	const dsn = process.env.SENTRY_DSN?.trim();
	if (!dsn) {
		enabled = false;
		return;
	}

	Sentry.init({
		dsn,
		environment: process.env.NODE_ENV ?? 'development',
		// Request/error capture only; tracing can be enabled later.
		tracesSampleRate: 0
	});
	enabled = true;
}

export function isSentryEnabled(): boolean {
	return enabled;
}

/** Capture an exception in Sentry when enabled; no-op otherwise. */
export function captureException(
	error: unknown,
	context?: { requestId?: string; extra?: Record<string, unknown> }
): void {
	if (!enabled) return;

	Sentry.withScope((scope) => {
		if (context?.requestId) {
			scope.setTag('request_id', context.requestId);
		}
		if (context?.extra) {
			scope.setExtras(context.extra);
		}
		Sentry.captureException(error);
	});
}
