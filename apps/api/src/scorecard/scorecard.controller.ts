import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
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
