import { ForbiddenException, Injectable } from '@nestjs/common';
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

	/**
	 * AUDIT-F09-06: soft-deleted tenants cannot be the active org for any API call.
	 * `tenants` has no RLS — safe to read without SET LOCAL.
	 */
	async assertTenantActive(tenantId: string, requestId?: string): Promise<void> {
		const rows = await this.db.sql<Array<{ deleted_at: Date | string | null }>>`
			select deleted_at from tenants where id = ${tenantId}::uuid
		`;
		const row = rows[0];
		if (!row || row.deleted_at != null) {
			throw new ForbiddenException({
				error: {
					code: 'tenant_inactive',
					message: 'This organization is inactive'
				},
				request_id: requestId
			});
		}
	}

	async withTenant<T>(tenantId: string, fn: (ctx: { db: TenantDb }) => Promise<T>): Promise<T> {
		return this.db.client.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
			return fn({ db: tx as TenantDb });
		});
	}
}
