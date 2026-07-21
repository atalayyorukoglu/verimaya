import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DbService } from '../db/db.service';
import * as schema from '../db/schema';

export type TenantDb = PostgresJsDatabase<typeof schema>;

/**
 * Runs work inside a single Drizzle transaction with
 * `SET LOCAL app.current_tenant_id` so RLS policies apply.
 * Runtime DB user must be `verimaya_app` (NOBYPASSRLS) — not the Docker superuser.
 *
 * Uses `db.transaction` (not `sql.begin` + `drizzle(tx)`): postgres.js transaction
 * objects lack `options.parsers`, which breaks drizzle-orm@0.44 construct().
 */
@Injectable()
export class TenantContextService {
	constructor(private readonly db: DbService) {}

	async withTenant<T>(tenantId: string, fn: (ctx: { db: TenantDb }) => Promise<T>): Promise<T> {
		return this.db.client.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
			return fn({ db: tx as TenantDb });
		});
	}
}
