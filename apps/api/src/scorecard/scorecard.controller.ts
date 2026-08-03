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
	createProfile(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(scorecardProfileCreateSchema, body, req);
		return this.scorecardService.createProfile(getActiveOrgId(req), input);
	}

	@Patch('profile')
	@RequireOrgPermission('settings', 'update')
	patchProfile(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(scorecardProfilePatchSchema, body, req);
		return this.scorecardService.patchActiveProfile(getActiveOrgId(req), input);
	}

	@Post('assessments')
	@RequireOrgPermission('settings', 'update')
	startAssessment(@Req() req: FastifyRequest) {
		return this.scorecardService.startAssessment(getActiveOrgId(req));
	}

	@Post('assessments/:id/complete')
	@RequireOrgPermission('settings', 'update')
	completeAssessment(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.scorecardService.completeAssessment(getActiveOrgId(req), id);
	}

	@Put('assessments/:id/answers')
	@RequireOrgPermission('settings', 'update')
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
	startBaseline(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(scorecardBaselineCreateSchema, body, req);
		return this.scorecardService.startBaseline(getActiveOrgId(req), input);
	}

	/** Apply system-known answers onto the open assessment (or `:id`). */
	@Post('auto-fill')
	@RequireOrgPermission('settings', 'update')
	autoFillOpen(@Req() req: FastifyRequest) {
		return this.autoFillService.applyAutoFill(getActiveOrgId(req));
	}

	@Post('assessments/:id/auto-fill')
	@RequireOrgPermission('settings', 'update')
	autoFillAssessment(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.autoFillService.applyAutoFill(getActiveOrgId(req), id);
	}
}
