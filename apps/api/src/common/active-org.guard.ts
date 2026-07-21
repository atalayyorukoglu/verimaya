import {
	BadRequestException,
	CanActivate,
	ExecutionContext,
	Injectable
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class ActiveOrgGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const req = context.switchToHttp().getRequest<FastifyRequest>();
		const orgId = req.authSession?.session.activeOrganizationId;
		if (!orgId) {
			throw new BadRequestException({
				error: {
					code: 'active_organization_required',
					message: 'Active organization is required'
				},
				request_id: req.id
			});
		}
		return true;
	}
}

export function getActiveOrgId(req: FastifyRequest): string {
	const orgId = req.authSession?.session.activeOrganizationId;
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
	const user = req.authSession!.user;
	return {
		actorId: user.id,
		actorDisplayName: user.name?.trim() || user.email
	};
}

export function getIdempotencyKey(req: FastifyRequest): string | undefined {
	const raw = req.headers['idempotency-key'];
	if (Array.isArray(raw)) return raw[0]?.trim() || undefined;
	return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}
