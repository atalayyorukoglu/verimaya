/**
 * Frankfurter v1/ECB FX client — NOT v2 blended rates.
 * Conventions match apps/api/scripts/backfill-ad-spend-fx.js.
 */
import {
	BadGatewayException,
	GatewayTimeoutException,
	Injectable,
	Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Explicit v1/ECB path — do not use v2 blended rates (rates diverge). */
export const DEFAULT_FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1';

export type FrankfurterRateResult = {
	rate: number;
	rateDate: string;
	url: string;
};

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export class FrankfurterProviderError extends Error {
	constructor(
		readonly code: 'rate_provider_error' | 'rate_provider_timeout' | 'rate_unavailable',
		readonly status: number,
		message: string,
		readonly httpStatus?: number
	) {
		super(message);
		this.name = 'FrankfurterProviderError';
	}
}

/**
 * Calendar date only — never Date#toISOString (TZ shift can move the day).
 */
export function toIsoDate(value: unknown): string {
	if (typeof value === 'string') {
		const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
		if (m) return m[1];
	}
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		const y = value.getUTCFullYear();
		const mo = String(value.getUTCMonth() + 1).padStart(2, '0');
		const d = String(value.getUTCDate()).padStart(2, '0');
		return `${y}-${mo}-${d}`;
	}
	return String(value).slice(0, 10);
}

/** UTC today as YYYY-MM-DD (ECB calendar is date-only). */
export function utcTodayIso(): string {
	return toIsoDate(new Date());
}

/** Clamp requested calendar date to today (Frankfurter 404s on future dates). */
export function clampFxDate(on: string, today: string = utcTodayIso()): string {
	return on > today ? today : on;
}

@Injectable()
export class FrankfurterClient {
	private readonly logger = new Logger(FrankfurterClient.name);
	private apiBase: string;
	private fetchFn: FetchFn;
	private sleepFn: (ms: number) => Promise<void>;
	private timeoutMs: number;

	constructor(config: ConfigService) {
		this.apiBase = config.get<string>('FRANKFURTER_BASE')?.trim() || DEFAULT_FRANKFURTER_BASE;
		this.fetchFn = fetch;
		this.sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
		this.timeoutMs = 15_000;
	}

	/** Test-only hooks — not registered with Nest DI. */
	withTestHooks(opts: {
		fetchFn?: FetchFn;
		sleepFn?: (ms: number) => Promise<void>;
		timeoutMs?: number;
		apiBase?: string;
	}): this {
		if (opts.apiBase?.trim()) this.apiBase = opts.apiBase.trim();
		if (opts.fetchFn) this.fetchFn = opts.fetchFn;
		if (opts.sleepFn) this.sleepFn = opts.sleepFn;
		if (opts.timeoutMs != null) this.timeoutMs = opts.timeoutMs;
		return this;
	}

	/**
	 * Fetch 1 unit of `from` in `to` for calendar day `on` (already clamped).
	 * Retries once on timeout; fails immediately on 4xx.
	 * Returns the provider's own `date` (may be earlier than `on` on weekends/holidays).
	 */
	async fetchRate(on: string, from: string, to: string): Promise<FrankfurterRateResult> {
		const url = `${this.apiBase.replace(/\/$/, '')}/${on}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
		let lastError: FrankfurterProviderError | null = null;

		for (let attempt = 0; attempt < 2; attempt++) {
			const controller = new AbortController();
			let timedOut = false;
			const timer = setTimeout(() => {
				timedOut = true;
				controller.abort();
			}, this.timeoutMs);
			try {
				const res = await this.fetchFn(url, {
					redirect: 'follow',
					signal: controller.signal
				});
				if (!res.ok) {
					if (res.status >= 400 && res.status < 500) {
						throw new FrankfurterProviderError(
							'rate_provider_error',
							502,
							`rate_provider_error_${res.status}_${from}_${to}`,
							res.status
						);
					}
					lastError = new FrankfurterProviderError(
						'rate_provider_error',
						502,
						`rate_provider_error_${res.status}_${from}_${to}`,
						res.status
					);
				} else {
					const body = (await res.json()) as {
						date?: string;
						rates?: Record<string, number>;
					};
					const rate = body.rates?.[to];
					if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
						throw new FrankfurterProviderError(
							'rate_unavailable',
							502,
							`rate_unavailable_${from}_${to}`
						);
					}
					const rateDate = body.date ? toIsoDate(body.date) : on;
					return { rate, rateDate, url: res.url || url };
				}
			} catch (err) {
				if (err instanceof FrankfurterProviderError) {
					if (err.code === 'rate_provider_error' && err.httpStatus && err.httpStatus < 500) {
						throw err;
					}
					if (err.code === 'rate_unavailable') throw err;
					lastError = err;
				} else if (timedOut || isAbortOrTimeout(err)) {
					lastError = new FrankfurterProviderError(
						'rate_provider_timeout',
						504,
						'rate_provider_timeout'
					);
				} else {
					lastError = new FrankfurterProviderError(
						'rate_provider_error',
						502,
						`rate_provider_failed: ${err instanceof Error ? err.message : String(err)}`
					);
				}
			} finally {
				clearTimeout(timer);
			}

			if (attempt === 0 && lastError?.code === 'rate_provider_timeout') {
				this.logger.warn({ url, attempt }, 'Frankfurter timeout — retrying once');
				await this.sleepFn(1000);
				continue;
			}
			break;
		}

		if (lastError) throw lastError;
		throw new FrankfurterProviderError('rate_provider_error', 502, 'rate_provider_failed');
	}
}

function isAbortOrTimeout(err: unknown): boolean {
	if (!err || typeof err !== 'object') return false;
	const name = (err as { name?: string }).name;
	if (name === 'AbortError' || name === 'TimeoutError') return true;
	const cause = (err as { cause?: { name?: string } }).cause;
	return cause?.name === 'AbortError' || cause?.name === 'TimeoutError';
}

/** Map provider errors to Nest HTTP exceptions with ApiError-shaped bodies. */
export function frankfurterErrorToHttp(err: FrankfurterProviderError, requestId: string) {
	const body = {
		error: { code: err.code, message: err.message },
		request_id: requestId
	};
	if (err.status === 504) return new GatewayTimeoutException(body);
	return new BadGatewayException(body);
}
