import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

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
		fn: (tx: {
			// postgres.js reserved transaction connection
			(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
		}) => Promise<T>
	): Promise<T> {
		const result = await this.db.sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return fn(tx as never);
		});
		return result as T;
	}
}
