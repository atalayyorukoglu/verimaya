import { Controller, Delete, Get, Inject, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
	driveOAuthCallbackQuery,
	type DriveConnectionStatus,
	type DriveSyncResponse
} from '@verimaya/shared';
import { ActiveOrgGuard, getActiveOrgId } from '../../common/active-org.guard';
import { IdempotencyExempt } from '../../common/idempotent.decorator';
import { OrgPermissionGuard } from '../../common/org-permission.guard';
import { RequireOrgPermission } from '../../common/require-org-permission.decorator';
import { SessionGuard } from '../../auth/session.guard';
import { SettingsService } from '../../settings/settings.service';
import { DriveMirrorEnqueueService } from './drive-mirror-enqueue.service';
import { DriveMirrorService } from './drive-mirror.service';
import { DriveOAuthStateService } from './drive-oauth.state';
import { driveRedirectUri } from './google-drive.adapter';
import { DRIVE_CLIENT, DRIVE_CREDENTIAL_PROVIDER, type DriveClientPort } from './drive.types';

function webPublicUrl(): string {
	const base = process.env.WEB_PUBLIC_URL?.trim();
	if (!base) return 'http://localhost:5174';
	return base.replace(/\/$/, '');
}

/**
 * DRIVE-01 — Ayarlar › Google Drive yüzeyi. Sınıf düzeyinde muhafız üçlüsü
 * (AUDIT-F09-18); kamuya açık callback ayrı sınıfta, çünkü Nest sınıf ve metot
 * muhafızlarını birleştirir.
 */
@Controller('settings/drive')
@UseGuards(SessionGuard, ActiveOrgGuard, OrgPermissionGuard)
export class DriveSettingsController {
	constructor(
		private readonly mirror: DriveMirrorService,
		private readonly enqueue: DriveMirrorEnqueueService,
		private readonly oauthState: DriveOAuthStateService,
		@Inject(DRIVE_CLIENT) private readonly drive: DriveClientPort
	) {}

	@Get()
	@RequireOrgPermission('settings', 'read')
	status(@Req() req: FastifyRequest): Promise<DriveConnectionStatus> {
		return this.mirror.status(getActiveOrgId(req));
	}

	@Get('authorize')
	@RequireOrgPermission('settings', 'update')
	authorize(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
		const state = this.oauthState.encodeState({ tenantId: getActiveOrgId(req) });
		const url = this.drive.buildAuthorizeUrl({ state, redirectUri: driveRedirectUri() });
		return reply.redirect(url, 302);
	}

	@Delete()
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Bağlantıyı kesme sağlayıcı başına tekil silmedir; zaten kesikse 0 satır siler, hata değil — doğası gereği idempotent.'
	)
	async disconnect(@Req() req: FastifyRequest): Promise<DriveConnectionStatus> {
		const tenantId = getActiveOrgId(req);
		await this.mirror.disconnect(tenantId);
		return this.mirror.status(tenantId);
	}

	@Post('sync')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Toplu gönderim kuyruğa tek iş atar; iş zaten gönderilmiş dosyayı (drive_mirror_files) atlar, ikinci çağrı aynı sonuca yakınsar.'
	)
	async sync(@Req() req: FastifyRequest): Promise<DriveSyncResponse> {
		const jobId = await this.enqueue.enqueueBackfillForTenant(getActiveOrgId(req));
		return { queued: jobId !== null, job_id: jobId };
	}
}

/**
 * Kamuya açık OAuth callback — Google tarayıcıyı `code`+`state` ile buraya
 * yollar. Oturum/API anahtarı yoktur; tenant imzalı state'ten çözülür.
 */
@Controller('settings/drive')
export class DriveOAuthCallbackController {
	constructor(
		private readonly oauthState: DriveOAuthStateService,
		private readonly settings: SettingsService,
		@Inject(DRIVE_CLIENT) private readonly drive: DriveClientPort
	) {}

	@Get('callback')
	async callback(
		@Res() reply: FastifyReply,
		@Query('code') code?: string,
		@Query('state') state?: string
	) {
		const query = driveOAuthCallbackQuery.parse({ code, state });
		const payload = await this.oauthState.decodeState(query.state);
		const { refreshToken, email } = await this.drive.exchangeCode({
			code: query.code,
			redirectUri: driveRedirectUri()
		});
		await this.settings.storeCredential(payload.tenantId, DRIVE_CREDENTIAL_PROVIDER, {
			secret: JSON.stringify({ refreshToken, email })
		});
		return reply.redirect(`${webPublicUrl()}/settings/drive?drive=connected`, 302);
	}
}
