import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { DbService } from '../db/db.service';
import { extractBearerToken, hashApiKey, isApiKeyToken } from './api-key-crypto';

export type ApiKeyAuth = {
	tenantId: string;
	apiKeyId: string;
	scopes: string[];
};

declare module 'fastify' {
	interface FastifyRequest {
		apiKeyAuth?: ApiKeyAuth;
	}
}

/**
 * Guard for machine-to-machine access via `Authorization: Bearer vk_...`.
 * Used directly on api-key-only routes, or via `AuthOrApiKeyGuard` on domain
 * controllers that accept either a session or an API key (Faz 6).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
	constructor(private readonly dbService: DbService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<FastifyRequest>();
		const token = extractBearerToken(req.headers.authorization);
		if (!token || !isApiKeyToken(token)) {
			throw new UnauthorizedException({
				error: { code: 'unauthorized', message: 'Valid API key required' },
				request_id: req.id
			});
		}

		const keyHash = hashApiKey(token);
		const [row] = await this.dbService.sql<
			Array<{ id: string; tenant_id: string; scopes: string[] }>
		>`select id, tenant_id, scopes from app.lookup_api_key(${keyHash})`;

		if (!row) {
			throw new UnauthorizedException({
				error: { code: 'unauthorized', message: 'Valid API key required' },
				request_id: req.id
			});
		}

		// AUDIT-03 (Faz 8): record `last_used_at` on every successful lookup. Wrapped
		// in a transaction with explicit `app.current_tenant_id` because the
		// `verimaya_app` role's RLS would otherwise block the UPDATE (no tenant
		// context set). We extract the tenant id from the looked-up row and use
		// `set_config` inside a transaction.
		const updateSql = this.dbService.sql;
		void updateSql
			.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${row.tenant_id}::uuid, true)`;
				await tx`update api_keys set last_used_at = now() where id = ${row.id}::uuid`;
			})
			.catch(() => {
				// best-effort: don't fail the request because the audit update failed
			});

		req.apiKeyAuth = {
			tenantId: row.tenant_id,
			apiKeyId: row.id,
			scopes: row.scopes
		};
		return true;
	}
}
