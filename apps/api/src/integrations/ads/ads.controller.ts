import {
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Query,
	Req,
	Res,
	UseGuards
} from '@nestjs/common';
import { adOAuthCallbackQuery, type AdConnectionsResponse, type AdProvider } from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { max, eq } from 'drizzle-orm';
import { ActiveOrgGuard, getActiveOrgId } from '../../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../../common/auth-or-api-key.guard';
import { adMetricsDaily } from '../../db/schema';
import { SettingsService } from '../../settings/settings.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { AdsAdapterRegistry } from './ads-adapter.registry';
import { AdsOAuthStateService } from './ads-oauth.state';

const AD_PROVIDERS: AdProvider[] = ['meta', 'google'];

function adsRedirectBase(): string {
	const base = process.env.ADS_OAUTH_REDIRECT_BASE?.trim();
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

function redirectUriFor(provider: AdProvider): string {
	return `${adsRedirectBase()}/v1/integrations/ads/${provider}/callback`;
}

@Controller('integrations/ads')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard)
export class AdsController {
	constructor(
		private readonly registry: AdsAdapterRegistry,
		private readonly oauthState: AdsOAuthStateService,
		private readonly settings: SettingsService,
		private readonly tenantContext: TenantContextService
	) {}

	@Get('status')
	async status(@Req() req: FastifyRequest): Promise<AdConnectionsResponse> {
		const tenantId = getActiveOrgId(req);
		const items = await Promise.all(
			AD_PROVIDERS.map(async (provider) => {
				const cred = await this.settings.getCredentialStatus(tenantId, provider);
				const last_sync_date = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
					const [row] = await db
						.select({ last: max(adMetricsDaily.date) })
						.from(adMetricsDaily)
						.where(eq(adMetricsDaily.provider, provider));
					return row?.last ?? null;
				});

				return {
					provider,
					connected: cred.configured,
					key_version: cred.configured ? (cred.key_version ?? null) : null,
					last_sync_date
				};
			})
		);

		return { items };
	}

	@Get(':provider/authorize')
	async authorize(
		@Req() req: FastifyRequest,
		@Res() reply: FastifyReply,
		@Param('provider') providerParam: string
	) {
		const provider = this.registry.parseProvider(providerParam);
		const tenantId = getActiveOrgId(req);
		const redirectUri = redirectUriFor(provider);
		const state = this.oauthState.encodeState({ tenantId, provider });
		const url = this.registry.get(provider).buildAuthorizeUrl({ state, redirectUri });
		return reply.redirect(url, 302);
	}

	@Get(':provider/callback')
	async callback(
		@Res() reply: FastifyReply,
		@Param('provider') providerParam: string,
		@Query('code') code?: string,
		@Query('state') state?: string
	) {
		const provider = this.registry.parseProvider(providerParam);
		const query = adOAuthCallbackQuery.parse({ code, state });
		const payload = this.oauthState.decodeState(query.state, provider);
		const redirectUri = redirectUriFor(provider);
		const { secret } = await this.registry.get(provider).exchangeCode({
			code: query.code,
			redirectUri
		});
		await this.settings.storeCredential(payload.tenantId, provider, { secret });
		return reply.redirect(`${webPublicUrl()}/ayarlar/baglantilar?ads=${provider}`, 302);
	}

	@Delete(':provider')
	@HttpCode(204)
	async disconnect(@Req() req: FastifyRequest, @Param('provider') providerParam: string) {
		const provider = this.registry.parseProvider(providerParam);
		await this.settings.deleteCredential(getActiveOrgId(req), provider);
	}
}
