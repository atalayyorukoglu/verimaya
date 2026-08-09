import {
	BadRequestException,
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
	ServiceUnavailableException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const USED_KEY_PREFIX = 'oauth:state:used:';

/**
 * One-time OAuth state (jti) ledger. SET NX PX — first claim wins; Redis down is fail-closed
 * so callbacks cannot bypass replay protection when the store is unreachable.
 */
@Injectable()
export class OAuthStateUsedStore implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(OAuthStateUsedStore.name);
	private redis: Redis | null = null;

	constructor(private readonly config: ConfigService) {}

	async onModuleInit() {
		const url = this.config.getOrThrow<string>('REDIS_URL');
		this.redis = new Redis(url, { maxRetriesPerRequest: null });
	}

	/**
	 * Atomically marks `jti` as used for `ttlMs`. Throws `oauth_state_replayed` if already set;
	 * `oauth_state_store_unavailable` when Redis is down or the SET fails (fail-closed).
	 */
	async claimOnce(jti: string, ttlMs: number): Promise<void> {
		if (!this.redis) {
			throw new ServiceUnavailableException({
				error: {
					code: 'oauth_state_store_unavailable',
					message: 'OAuth state store is not ready'
				}
			});
		}

		const key = `${USED_KEY_PREFIX}${jti}`;
		const px = Math.max(1, Math.floor(ttlMs));

		let result: string | null;
		try {
			result = await this.redis.set(key, '1', 'PX', px, 'NX');
		} catch (err: unknown) {
			// No jti in the log line: a failed SET did NOT burn the state, so the value is
			// still live and must not leak into log sinks.
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(`OAuth state claim failed: ${message}`);
			throw new ServiceUnavailableException({
				error: {
					code: 'oauth_state_store_unavailable',
					message: 'OAuth state store unavailable'
				}
			});
		}

		if (result === null) {
			throw new BadRequestException({
				error: { code: 'oauth_state_replayed', message: 'OAuth state already used' }
			});
		}
	}

	async onModuleDestroy() {
		if (this.redis) {
			await this.redis.quit();
		}
		this.redis = null;
	}
}
