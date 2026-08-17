import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { mayaAskSchema } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../common/auth-or-api-key.guard';
import { IdempotencyExempt } from '../common/idempotent.decorator';
import { parseBody } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { MayaService } from './maya.service';

@Controller('maya')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class MayaController {
	constructor(private readonly mayaService: MayaService) {}

	/**
	 * İzin `settings:read` — bilgi bankası ayarlar altında yaşıyor ve her rol onu okuyabiliyor.
	 * Maya yalnız o bilgiyi okuyup cevaplıyor, yeni yetki açmıyor.
	 */
	@Post('ask')
	@RequireOrgPermission('settings', 'read')
	@IdempotencyExempt(
		'Read-only question answering; no state is written. Repeat calls are safe and may legitimately return different phrasing.'
	)
	ask(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(mayaAskSchema, body, req);
		return this.mayaService.ask(getActiveOrgId(req), input);
	}
}
