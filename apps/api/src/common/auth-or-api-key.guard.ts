import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { extractBearerToken, isApiKeyToken } from '../api-keys/api-key-crypto';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { SessionGuard } from '../auth/session.guard';

/**
 * Accepts either a `better-auth` session cookie or an `Authorization: Bearer vk_...`
 * API key. Applied to domain controllers that external integrations may call
 * directly (Faz 6).
 *
 * AUDIT-F09-02: crude GET→read / mutate→write checks removed. Per-key
 * `resource:action` scopes are enforced by `OrgPermissionGuard` (deny-by-default).
 */
@Injectable()
export class AuthOrApiKeyGuard implements CanActivate {
	constructor(
		private readonly apiKeyGuard: ApiKeyGuard,
		private readonly sessionGuard: SessionGuard
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<FastifyRequest>();
		const token = extractBearerToken(req.headers.authorization);

		if (token && isApiKeyToken(token)) {
			await this.apiKeyGuard.canActivate(context);
			return true;
		}

		return this.sessionGuard.canActivate(context);
	}
}
