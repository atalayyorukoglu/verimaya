import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
	scorecardAnswerUpsertSchema,
	scorecardBaselineCreateSchema,
	scorecardProfileCreateSchema,
	scorecardProfilePatchSchema
} from '@verimaya/shared';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { IdempotencyExempt } from '../common/idempotent.decorator';
import { parseBody } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { ScorecardAutoFillService } from './auto-fill.service';
import { ScorecardService } from './scorecard.service';

/**
 * Organizational self-assessment (internal "Karne") — treated as settings-domain
 * configuration data: any member can read, only settings.update roles (owner,
 * admin, manager) can start/answer/complete assessments (AUTH-01C5).
 */
@Controller('scorecard')
@UseGuards(SessionGuard, ActiveOrgGuard, OrgPermissionGuard)
export class ScorecardController {
	constructor(
		private readonly scorecardService: ScorecardService,
		private readonly autoFillService: ScorecardAutoFillService
	) {}

	@Get('current')
	@RequireOrgPermission('settings', 'read')
	getCurrent(@Req() req: FastifyRequest) {
		return this.scorecardService.getCurrent(getActiveOrgId(req));
	}

	@Get('assessments')
	@RequireOrgPermission('settings', 'read')
	listAssessments(@Req() req: FastifyRequest) {
		return this.scorecardService.listAssessments(getActiveOrgId(req));
	}

	@Get('assessments/:id')
	@RequireOrgPermission('settings', 'read')
	getAssessment(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.scorecardService.getAssessment(getActiveOrgId(req), id);
	}

	@Get('compare')
	@RequireOrgPermission('settings', 'read')
	compare(
		@Req() req: FastifyRequest,
		@Query('previous') previousId: string,
		@Query('current') currentId: string
	) {
		return this.scorecardService.compareAssessments(
			getActiveOrgId(req),
			previousId ?? '',
			currentId ?? ''
		);
	}

	@Get('profile')
	@RequireOrgPermission('settings', 'read')
	getProfile(@Req() req: FastifyRequest) {
		return this.scorecardService.getActiveProfile(getActiveOrgId(req));
	}

	@Post('profile')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'App-level guard (ConflictException) rejects a second active profile per tenant — a retry cannot create a duplicate, it 409s instead.'
	)
	createProfile(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(scorecardProfileCreateSchema, body, req);
		return this.scorecardService.createProfile(getActiveOrgId(req), input);
	}

	@Patch('profile')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Sets absolute fields (only the ones present in the body) on the active profile; the locked-profile guard (409) is retry-stable either way — repeat calls converge to the same outcome.'
	)
	patchProfile(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(scorecardProfilePatchSchema, body, req);
		return this.scorecardService.patchActiveProfile(getActiveOrgId(req), input);
	}

	@Post('assessments')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Naturally idempotent by design: returns the already-open assessment instead of starting a new one when one exists (see ScorecardService.startAssessment).'
	)
	startAssessment(@Req() req: FastifyRequest) {
		return this.scorecardService.startAssessment(getActiveOrgId(req));
	}

	@Post('assessments/:id/complete')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Naturally idempotent by design: returns the already-completed assessment unchanged on repeat calls (see ScorecardService.completeAssessment).'
	)
	completeAssessment(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.scorecardService.completeAssessment(getActiveOrgId(req), id);
	}

	@Put('assessments/:id/answers')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'True upsert by (assessment_id, criterion_id) — repeat PUTs converge to the same stored answer.'
	)
	upsertAnswer(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown
	) {
		const input = parseBody(scorecardAnswerUpsertSchema, body, req);
		return this.scorecardService.upsertAnswer(getActiveOrgId(req), id, input);
	}

	@Post('baseline')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Known gap: unconditionally inserts a new profile+assessment, unlike startAssessment there is no "already open" guard, so a retried request could create a duplicate baseline. Deferred — rare, deliberate, owner/admin-only action, not a high-frequency or financial flow; wire like createFinanceCategory (Faz 4.1, settings.controller.ts) if this becomes a real pain point.'
	)
	startBaseline(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(scorecardBaselineCreateSchema, body, req);
		return this.scorecardService.startBaseline(getActiveOrgId(req), input);
	}

	/** Apply system-known answers onto the open assessment (or `:id`). */
	@Post('auto-fill')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Upserts per criterion (update existing / insert new) and recomputes deterministically from current evidence, skipping manual answers — repeat calls converge to the same result (see ScorecardAutoFillService.applyAutoFill).'
	)
	autoFillOpen(@Req() req: FastifyRequest) {
		return this.autoFillService.applyAutoFill(getActiveOrgId(req));
	}

	@Post('assessments/:id/auto-fill')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt('Same as auto-fill above — upserts per criterion, deterministic given the same evidence.')
	autoFillAssessment(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.autoFillService.applyAutoFill(getActiveOrgId(req), id);
	}
}
