import {
	Controller,
	Delete,
	Get,
	HttpCode,
	Query,
	Req,
	Res,
	UseGuards
} from '@nestjs/common';
import { ghlOAuthCallbackQuery, type GhlConnectionStatus } from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ActiveOrgGuard, getActiveOrgId } from '../../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../../common/auth-or-api-key.guard';
import { OrgPermissionGuard } from '../../common/org-permission.guard';
import { RequireOrgPermission } from '../../common/require-org-permission.decorator';
import { SettingsService } from '../../settings/settings.service';
import {
	ghlOAuthClientFromEnv,
	parseGhlStoredSecret,
	type GhlOAuthClient
} from './ghl-oauth.client';
import { GHL_OAUTH_PROVIDER, GhlOAuthStateService } from './ghl-oauth.state';

function ghlRedirectBase(): string {
	const base =
		process.env.GHL_OAUTH_REDIRECT_BASE?.trim() ||
		process.env.ADS_OAUTH_REDIRECT_BASE?.trim();
	if (!base) {
		return 'http://localhost:3000';
	}
	return base.replace(/\/$/, '');
}

function webPublicUrl(): string {
	const base = process.env.WEB_PUBLIC_URL?.trim();
	if (!base) {
		return 'http://localhost:5174';
	}
	return base.replace(/\/$/, '');
}

function ghlCallbackRedirectUri(): string {
	return `${ghlRedirectBase()}/v1/integrations/ghl/callback`;
}

@Controller('integrations/ghl')
export class GhlController {
	private readonly oauth: GhlOAuthClient;

	constructor(
		private readonly oauthState: GhlOAuthStateService,
		private readonly settings: SettingsService
	) {
		this.oauth = ghlOAuthClientFromEnv();
	}

	@Get('status')
	@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
	@RequireOrgPermission('settings', 'read')
	async status(@Req() req: FastifyRequest): Promise<GhlConnectionStatus> {
		const tenantId = getActiveOrgId(req);
		const cred = await this.settings.getCredentialStatus(tenantId, GHL_OAUTH_PROVIDER);
		if (!cred.configured) {
			return {
				connected: false,
				key_version: null,
				location_id: null,
				user_type: null
			};
		}

		let location_id: string | null = null;
		let user_type: GhlConnectionStatus['user_type'] = null;
		try {
			const secret = await this.settings.loadCredentialSecret(tenantId, GHL_OAUTH_PROVIDER);
			const parsed = parseGhlStoredSecret(secret);
			location_id = parsed.locationId;
			user_type = parsed.userType;
		} catch {
			// Credential row exists but secret unreadable — still report connected.
		}

		return {
			connected: true,
			key_version: cred.key_version ?? null,
			location_id,
			user_type
		};
	}

	@Get('authorize')
	@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
	@RequireOrgPermission('settings', 'update')
	async authorize(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
		const tenantId = getActiveOrgId(req);
		const redirectUri = ghlCallbackRedirectUri();
		const state = this.oauthState.encodeState({ tenantId });
		const url = this.oauth.buildAuthorizeUrl({ state, redirectUri });
		return reply.redirect(url, 302);
	}

	@Get('callback')
	async callback(
		@Res() reply: FastifyReply,
		@Query('code') code?: string,
		@Query('state') state?: string
	) {
		const query = ghlOAuthCallbackQuery.parse({ code, state });
		const payload = this.oauthState.decodeState(query.state);
		const redirectUri = ghlCallbackRedirectUri();
		const { secret } = await this.oauth.exchangeCode({
			code: query.code,
			redirectUri
		});
		await this.settings.storeCredential(payload.tenantId, GHL_OAUTH_PROVIDER, { secret });
		return reply.redirect(`${webPublicUrl()}/settings/connections/ghl?ghl=connected`, 302);
	}

	@Delete()
	@HttpCode(204)
	@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
	@RequireOrgPermission('settings', 'update')
	async disconnect(@Req() req: FastifyRequest) {
		await this.settings.deleteCredential(getActiveOrgId(req), GHL_OAUTH_PROVIDER);
	}
}
