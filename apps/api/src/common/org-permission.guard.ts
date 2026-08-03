import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { MeService } from '../auth/me.service';
import { hasOrgPermission } from '../auth/permissions';
import {
	ORG_PERMISSION_METADATA_KEY,
	type OrgPermissionRequirement
} from './require-org-permission.decorator';

@Injectable()
export class OrgPermissionGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly meService: MeService
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<FastifyRequest>();
		const requirement = this.reflector.getAllAndOverride<OrgPermissionRequirement>(
			ORG_PERMISSION_METADATA_KEY,
			[context.getHandler(), context.getClass()]
		);

		if (!requirement) {
			throw this.insufficientPermission(req.id);
		}

		if (req.apiKeyAuth) {
			return true;
		}

		const session = req.authSession;
		if (!session) {
			throw this.insufficientPermission(req.id);
		}

		const role = await this.meService.resolveOrganizationRole({
			userId: session.user.id,
			activeOrganizationId: session.session.activeOrganizationId,
			requestId: String(req.id)
		});
		if (!hasOrgPermission(role, requirement.resource, requirement.action)) {
			throw this.insufficientPermission(req.id);
		}

		return true;
	}

	private insufficientPermission(requestId: string | number): ForbiddenException {
		return new ForbiddenException({
			error: {
				code: 'insufficient_permission',
				message: 'Organization permission is required'
			},
			request_id: String(requestId)
		});
	}
}
