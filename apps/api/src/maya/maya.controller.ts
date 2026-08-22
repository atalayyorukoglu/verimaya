import { Body, Controller, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { mayaAskSchema } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../common/auth-or-api-key.guard';
import { IdempotencyExempt } from '../common/idempotent.decorator';
import { parseBody } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import type { MayaActor } from './maya-tools.service';
import { MayaService } from './maya.service';

@Controller('maya')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class MayaController {
	constructor(private readonly mayaService: MayaService) {}

	/**
	 * İzin `settings:read` — bilgi bankası ayarlar altında yaşıyor ve her rol onu okuyabiliyor.
	 *
	 * **AI-11a uyarısı:** bu izin canlı veri araçları için YETMEZ ve yeterli sayılmamalı.
	 * Guard'ı `finance:read`'e yükseltmek de yanlış olurdu — o zaman bilgi bankası
	 * sorusu soran temsilci kapıda kalırdı. Doğru sınır araç başına, çalışma anında:
	 * `MayaToolsService.isToolAllowed`. Buradaki gevşek izin, oradaki sıkı izinle
	 * birlikte anlamlı.
	 */
	@Post('ask')
	@RequireOrgPermission('settings', 'read')
	@IdempotencyExempt(
		'Read-only question answering; no state is written. Repeat calls are safe and may legitimately return different phrasing.'
	)
	ask(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(mayaAskSchema, body, req);
		return this.mayaService.ask(getActiveOrgId(req), input, resolveMayaActor(req));
	}
}

/**
 * Araç izni için kimlik. Oturumda rol + tenant deny override'larıyla çözülür; API
 * anahtarında açık scope listesi ACL'dir (AUDIT-F09-02 — anahtarlar RBAC'ı atlamaz).
 */
function resolveMayaActor(req: FastifyRequest): MayaActor {
	if (req.authSession) {
		return {
			kind: 'session',
			userId: req.authSession.user.id,
			requestId: String(req.id)
		};
	}
	if (req.apiKeyAuth) {
		return { kind: 'api_key', scopes: req.apiKeyAuth.scopes };
	}
	throw new UnauthorizedException({
		error: { code: 'unauthorized', message: 'Authentication required' },
		request_id: String(req.id)
	});
}
