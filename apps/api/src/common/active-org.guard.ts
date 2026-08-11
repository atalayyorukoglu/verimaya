import {
	BadRequestException,
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { TenantContextService } from '../tenant/tenant-context.service';

@Injectable()
export class ActiveOrgGuard implements CanActivate {
	constructor(private readonly tenantContext: TenantContextService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<FastifyRequest>();
		const orgId = getActiveOrgId(req);
		await this.tenantContext.assertTenantActive(orgId, req.id);
		return true;
	}
}

/**
 * Resolves the active tenant from either a session (activeOrganizationId) or
 * an API key (Faz 6 dual-auth). Never trust a tenant id supplied by the client.
 */
export function getActiveOrgId(req: FastifyRequest): string {
	const orgId = req.authSession?.session.activeOrganizationId ?? req.apiKeyAuth?.tenantId;
	if (!orgId) {
		throw new BadRequestException({
			error: {
				code: 'active_organization_required',
				message: 'Active organization is required'
			},
			request_id: req.id
		});
	}
	return orgId;
}

export function getActorFromRequest(req: FastifyRequest): {
	actorId: string;
	actorDisplayName: string;
} {
	if (req.authSession) {
		const user = req.authSession.user;
		return {
			actorId: user.id,
			actorDisplayName: user.name?.trim() || user.email
		};
	}

	if (req.apiKeyAuth) {
		return {
			actorId: `api_key:${req.apiKeyAuth.apiKeyId}`,
			actorDisplayName: 'API Key'
		};
	}

	throw new UnauthorizedException({
		error: { code: 'unauthorized', message: 'Authentication required' },
		request_id: req.id
	});
}

export function getIdempotencyKey(req: FastifyRequest): string | undefined {
	const raw = req.headers['idempotency-key'];
	if (Array.isArray(raw)) return raw[0]?.trim() || undefined;
	return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}
