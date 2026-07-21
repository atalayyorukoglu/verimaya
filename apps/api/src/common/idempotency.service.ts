import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { idempotencyKeys } from '../db/schema';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

export type IdempotentResult<T> = {
	statusCode: number;
	body: T;
	replayed: boolean;
};

@Injectable()
export class IdempotencyService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async run<T>(
		tenantId: string,
		key: string | undefined,
		method: string,
		path: string,
		handler: (db: TenantDb) => Promise<{ statusCode: number; body: T }>
	): Promise<IdempotentResult<T>> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			if (key) {
				const existing = await db
					.select()
					.from(idempotencyKeys)
					.where(eq(idempotencyKeys.key, key))
					.limit(1);

				if (existing[0]) {
					return {
						statusCode: existing[0].statusCode,
						body: existing[0].responseBody as T,
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
					path,
					statusCode: result.statusCode,
					responseBody: result.body
				});
			}

			return { ...result, replayed: false };
		});
	}
}
