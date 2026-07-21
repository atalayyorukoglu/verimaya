import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { DbService } from '../db/db.service';
import { hashApiKey, isApiKeyToken } from './api-key-crypto';

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
 * Optional guard for machine-to-machine access via `Authorization: Bearer vk_...`.
 * Not wired globally yet — apply per-route when external API endpoints ship (Faz 6).
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
			[{ id: string; tenant_id: string; scopes: string[] }] | []
		>`select id, tenant_id, scopes from app.lookup_api_key(${keyHash})`;

		if (!row) {
			throw new UnauthorizedException({
				error: { code: 'unauthorized', message: 'Valid API key required' },
				request_id: req.id
			});
		}

		req.apiKeyAuth = {
			tenantId: row.tenant_id,
			apiKeyId: row.id,
			scopes: row.scopes
		};
		return true;
	}
}

function extractBearerToken(header: string | string[] | undefined): string | undefined {
	const raw = Array.isArray(header) ? header[0] : header;
	if (!raw?.startsWith('Bearer ')) {
		return undefined;
	}
	const token = raw.slice('Bearer '.length).trim();
	return token || undefined;
}
