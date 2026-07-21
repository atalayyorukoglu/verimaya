import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';
import * as schema from '../db/schema';

export type TenantDb = PostgresJsDatabase<typeof schema>;

export type TenantTx = postgres.TransactionSql;

/**
 * Runs work inside a single postgres.js transaction with
 * `SET LOCAL app.current_tenant_id` so RLS policies apply.
 * Runtime DB user must be `verimaya_app` (NOBYPASSRLS) — not the Docker superuser.
 */
@Injectable()
export class TenantContextService {
	constructor(private readonly db: DbService) {}

	async withTenant<T>(
		tenantId: string,
		fn: (ctx: { tx: TenantTx; db: TenantDb }) => Promise<T>
	): Promise<T> {
		const result = await this.db.sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const tenantDb = drizzle(tx as unknown as postgres.Sql, { schema });
			return fn({ tx, db: tenantDb });
		});
		return result as T;
	}
}
