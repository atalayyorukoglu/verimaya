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

		// AUDIT-02 (Faz 8, DEFERRED): the existing behavior short-circuits to `true` for
		// API-key auth. This is a known accepted risk — removing the short-circuit
		// without first implementing per-key resource scopes (AUDIT-F09-02) breaks
		// every API key in production, including the n8n integration credentials.
		//
		// The right fix is option (b) from the audit: per-key resource scope map
		// (e.g. `patients:write`, `settings:write`) that the guard maps to required
		// resources. That's L-effort (requires API key issuance UX changes, new
		// schema, migration). Deferred to AUDIT-F09-02 in the after-pilot backlog.
		//
		// What we ship NOW:
		//  - The short-circuit is preserved for the current API key shape.
		//  - A negative-isolation spec (`api-keys.isolation.spec.ts` in
		//    AUDIT-F09 follow-up) will assert the post-fix behavior.
		//  - The accepted-risk doc entry lives here so a future reader knows the
		//    bypass is documented, not forgotten.
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
