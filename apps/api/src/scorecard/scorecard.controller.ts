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
import { ScorecardAutoFillService } from './auto-fill.service';
import { ScorecardService } from './scorecard.service';

@Controller('scorecard')
@UseGuards(SessionGuard, ActiveOrgGuard)
export class ScorecardController {
	constructor(
		private readonly scorecardService: ScorecardService,
		private readonly autoFillService: ScorecardAutoFillService
	) {}

	@Get('current')
	getCurrent(@Req() req: FastifyRequest) {
		return this.scorecardService.getCurrent(getActiveOrgId(req));
	}

	@Get('assessments')
	listAssessments(@Req() req: FastifyRequest) {
		return this.scorecardService.listAssessments(getActiveOrgId(req));
	}

	@Get('assessments/:id')
	getAssessment(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.scorecardService.getAssessment(getActiveOrgId(req), id);
	}

	@Get('compare')
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
	getProfile(@Req() req: FastifyRequest) {
		return this.scorecardService.getActiveProfile(getActiveOrgId(req));
	}

	@Post('profile')
	createProfile(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(scorecardProfileCreateSchema, body, req);
		return this.scorecardService.createProfile(getActiveOrgId(req), input);
	}

	@Patch('profile')
	patchProfile(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(scorecardProfilePatchSchema, body, req);
		return this.scorecardService.patchActiveProfile(getActiveOrgId(req), input);
	}

	@Post('assessments')
	startAssessment(@Req() req: FastifyRequest) {
		return this.scorecardService.startAssessment(getActiveOrgId(req));
	}

	@Post('assessments/:id/complete')
	completeAssessment(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.scorecardService.completeAssessment(getActiveOrgId(req), id);
	}

	@Put('assessments/:id/answers')
	upsertAnswer(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown
	) {
		const input = parseBody(scorecardAnswerUpsertSchema, body, req);
		return this.scorecardService.upsertAnswer(getActiveOrgId(req), id, input);
	}

	@Post('baseline')
	startBaseline(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(scorecardBaselineCreateSchema, body, req);
		return this.scorecardService.startBaseline(getActiveOrgId(req), input);
	}

	/** Apply system-known answers onto the open assessment (or `:id`). */
	@Post('auto-fill')
	autoFillOpen(@Req() req: FastifyRequest) {
		return this.autoFillService.applyAutoFill(getActiveOrgId(req));
	}

	@Post('assessments/:id/auto-fill')
	autoFillAssessment(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.autoFillService.applyAutoFill(getActiveOrgId(req), id);
	}
}
