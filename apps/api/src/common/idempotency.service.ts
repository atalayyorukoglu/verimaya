import { Injectable } from '@nestjs/common';
import { and, eq, sql as drizzleSql } from 'drizzle-orm';
import { idempotencyKeys } from '../db/schema';
import { isUniqueViolation } from './postgres-errors';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

export type IdempotentResult<T> = {
	statusCode: number;
	body: T;
	replayed: boolean;
};

/** Must match the unique index name in db/schema/idempotency-keys.ts (IDEM-01, Faz 4.1). */
const IDEMPOTENCY_UNIQUE_INDEX = 'idempotency_keys_tenant_key_method_path_uidx';

/**
 * Advisory-lock kimliği. Ayırıcı, alanların birleşiminden doğabilecek çakışmayı önler
 * (ör. key="a" + method="bc" ile key="ab" + method="c" aynı string'i üretmesin).
 */
function lockIdentity(tenantId: string, key: string, method: string, normalizedPath: string) {
	return ['idem', tenantId, key, method, normalizedPath].join('|');
}

@Injectable()
export class IdempotencyService {
	constructor(private readonly tenantContext: TenantContextService) {}

	/**
	 * IDEM-01 (Faz 4.1): replay identity is tenant_id + key + method + normalizedPath — a key
	 * reused on a different method/endpoint runs its own handler instead of replaying someone
	 * else's response (the previous lookup only checked `key`). `normalizedPath` must be a
	 * route *template* ("/v1/patients/:id"), never a resolved path with a real id baked in —
	 * every call site in this repo passes a literal template string.
	 */
	async run<T>(
		tenantId: string,
		key: string | undefined,
		method: string,
		normalizedPath: string,
		handler: (db: TenantDb) => Promise<{ statusCode: number; body: T }>
	): Promise<IdempotentResult<T>> {
		try {
			return await this.tenantContext.withTenant(tenantId, async ({ db }) => {
				if (key) {
					// Faz 7 denetim bulgusu (F-03): salt select-then-insert altında iki eşzamanlı
					// istek de "yok" görüp handler'ı **iki kez** çalıştırıyordu; kaybedenin yazımları
					// geri alınsa da handler'ın DB dışı yan etkisi (dış API çağrısı, e-posta) iki kez
					// gerçekleşirdi. Transaction-ömürlü advisory lock ile aynı kimliğe sahip ikinci
					// istek birincinin commit'ini bekler, sonra replay satırını görür — handler
					// gerçekten tek kez koşar. Kilit commit/rollback ile otomatik bırakılır.
					await db.execute(
						drizzleSql`select pg_advisory_xact_lock(hashtextextended(${lockIdentity(tenantId, key, method, normalizedPath)}, 0))`
					);

					const existing = await this.findReplay(db, key, method, normalizedPath);
					if (existing) {
						return {
							statusCode: existing.statusCode,
							body: existing.responseBody as T,
							replayed: true
						};
					}
				}

				const result = await handler(db);

				if (key) {
					await db.insert(idempotencyKeys).values({
						tenantId,
						key,
						method,
						normalizedPath,
						statusCode: result.statusCode,
						responseBody: result.body
					});
				}

				return { ...result, replayed: false };
			});
		} catch (err) {
			// Concurrent duplicate: two requests with the identical tenant+key+method+path raced
			// the select-then-insert above and both passed the "not found" check. Postgres has
			// already rolled back the loser's *entire* transaction — including any handler side
			// effects, e.g. MONEY-01's inserted transactions — so no double-write survives; only
			// the response needs recovering. Replay the winner's stored row instead of surfacing
			// the raw 500.
			if (!key || !isUniqueViolation(err, IDEMPOTENCY_UNIQUE_INDEX)) throw err;

			return this.tenantContext.withTenant(tenantId, async ({ db }) => {
				const existing = await this.findReplay(db, key, method, normalizedPath);
				if (!existing) throw err; // conflict implies a row exists; don't silently swallow if it truly doesn't
				return {
					statusCode: existing.statusCode,
					body: existing.responseBody as T,
					replayed: true
				};
			});
		}
	}

	private async findReplay(db: TenantDb, key: string, method: string, normalizedPath: string) {
		const [row] = await db
			.select()
			.from(idempotencyKeys)
			.where(
				and(
					eq(idempotencyKeys.key, key),
					eq(idempotencyKeys.method, method),
					eq(idempotencyKeys.normalizedPath, normalizedPath)
				)
			)
			.limit(1);
		return row;
	}
}
