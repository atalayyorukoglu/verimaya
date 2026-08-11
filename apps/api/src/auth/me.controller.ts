import { Body, Controller, Get, Put, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { userUiPreferencesUpdateSchema } from '@verimaya/shared';
import {
	ActiveOrgGuard,
	getActiveOrgId,
	getActorFromRequest
} from '../common/active-org.guard';
import { IdempotencyExempt } from '../common/idempotent.decorator';
import { parseBody } from '../common/mappers';
import { DataSubjectService } from './data-subject.service';
import { MeService } from './me.service';
import { SessionGuard } from './session.guard';

@Controller('me')
export class MeController {
	constructor(
		private readonly meService: MeService,
		private readonly dataSubjectService: DataSubjectService
	) {}

	@Get()
	@UseGuards(SessionGuard)
	me(@Req() req: FastifyRequest) {
		const session = req.authSession!;
		return this.meService.resolveMembershipUser({
			userId: session.user.id,
			activeOrganizationId: session.session.activeOrganizationId,
			requestId: String(req.id),
			email: session.user.email
		});
	}

	/**
	 * Personal UI preferences for the session user in the active organization
	 * (e.g. which product modules appear under Ürünler). Not an org-admin setting.
	 */
	@Put('preferences')
	@UseGuards(SessionGuard, ActiveOrgGuard)
	@IdempotencyExempt(
		'True upsert via onConflictDoUpdate (user_id, organization_id) — PUT replace semantics; repeat calls converge to the same stored value.'
	)
	putPreferences(@Req() req: FastifyRequest, @Body() body: unknown) {
		const session = req.authSession!;
		const input = parseBody(userUiPreferencesUpdateSchema, body, req);
		return this.meService.savePreferences(session.user.id, getActiveOrgId(req), input);
	}

	/**
	 * AUDIT-F09-07 / KVKK m.11 — machine-readable export of the **session user's**
	 * org-scoped personal data. Subject is never taken from the client body.
	 */
	@Get('data-export')
	@UseGuards(SessionGuard, ActiveOrgGuard)
	dataExport(@Req() req: FastifyRequest) {
		const session = req.authSession!;
		return this.dataSubjectService.exportData(getActiveOrgId(req), session.user.id);
	}

	/**
	 * AUDIT-F09-07 / KVKK m.11 — deletion **request** + anonymization (no hard-delete).
	 * Self-only: session user is the sole subject.
	 */
	@Post('data-deletion-request')
	@UseGuards(SessionGuard, ActiveOrgGuard)
	@IdempotencyExempt(
		'Repeat POSTs converge: an already-applied anonymization request is returned; user/member rows are never hard-deleted.'
	)
	dataDeletionRequest(@Req() req: FastifyRequest) {
		const session = req.authSession!;
		return this.dataSubjectService.requestDeletion(
			getActiveOrgId(req),
			session.user.id,
			getActorFromRequest(req)
		);
	}
}
