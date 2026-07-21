import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { ApiKeyScope } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { extractBearerToken, isApiKeyToken } from '../api-keys/api-key-crypto';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { SessionGuard } from '../auth/session.guard';

/**
 * Accepts either a `better-auth` session cookie or an `Authorization: Bearer vk_...`
 * API key. Applied to domain controllers that external integrations may call
 * directly (Faz 6). API keys are additionally scope-checked: read-only requests
 * (`GET`) need the `read` scope, everything else needs `write`.
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
			assertHasRequiredScope(req);
			return true;
		}

		return this.sessionGuard.canActivate(context);
	}
}

function assertHasRequiredScope(req: FastifyRequest): void {
	const requiredScope: ApiKeyScope = req.method === 'GET' ? 'read' : 'write';
	const scopes = req.apiKeyAuth?.scopes ?? [];
	const hasScope =
		requiredScope === 'read'
			? scopes.includes('read') || scopes.includes('write')
			: scopes.includes('write');

	if (!hasScope) {
		throw new ForbiddenException({
			error: {
				code: 'insufficient_scope',
				message: `API key is missing the required '${requiredScope}' scope`
			},
			request_id: req.id
		});
	}
}
