import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { apiKeyHasScope } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { MeService } from '../auth/me.service';
import { PermissionOverridesService } from '../auth/permission-overrides.service';
import { hasOrgPermission } from '../auth/permissions';
import {
	ORG_PERMISSION_METADATA_KEY,
	type OrgPermissionRequirement
} from './require-org-permission.decorator';

@Injectable()
export class OrgPermissionGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly meService: MeService,
		private readonly permissionOverrides: PermissionOverridesService
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

		// AUDIT-F09-02: API keys no longer bypass RBAC. Deny-by-default — the key must
		// carry an explicit `resource:action` scope matching `@RequireOrgPermission`.
		// Unknown / unmapped endpoints are rejected (no scope → insufficient_scope).
		// Tenant role overrides do not apply to API keys (explicit scopes are the ACL).
		if (req.apiKeyAuth) {
			if (
				!apiKeyHasScope(
					req.apiKeyAuth.scopes,
					requirement.resource,
					requirement.action
				)
			) {
				throw new ForbiddenException({
					error: {
						code: 'insufficient_scope',
						message: `API key is missing the required '${requirement.resource}:${requirement.action}' scope`
					},
					request_id: String(req.id)
				});
			}
			return true;
		}

		const session = req.authSession;
		if (!session) {
			throw this.insufficientPermission(req.id);
		}

		const tenantId = session.session.activeOrganizationId;
		if (!tenantId) {
			throw this.insufficientPermission(req.id);
		}

		const role = await this.meService.resolveOrganizationRole({
			userId: session.user.id,
			activeOrganizationId: tenantId,
			requestId: String(req.id)
		});
		const deniedKeys = await this.permissionOverrides.getDeniedKeys(tenantId);
		if (!hasOrgPermission(role, requirement.resource, requirement.action, deniedKeys)) {
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
