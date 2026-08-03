import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Patch,
	Query,
	Req,
	Res,
	UseGuards
} from '@nestjs/common';
import {
	adGoogleCustomerIdUpdate,
	adOAuthCallbackQuery,
	type AdConnectionStatus,
	type AdConnectionsResponse,
	type AdProvider
} from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { max, eq } from 'drizzle-orm';
import { ActiveOrgGuard, getActiveOrgId } from '../../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../../common/auth-or-api-key.guard';
import { IdempotencyExempt } from '../../common/idempotent.decorator';
import { OrgPermissionGuard } from '../../common/org-permission.guard';
import { RequireOrgPermission } from '../../common/require-org-permission.decorator';
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

function parseGoogleCustomerId(secret: string): string | null {
	try {
		const parsed = JSON.parse(secret) as { customerId?: unknown };
		if (typeof parsed.customerId !== 'string') return null;
		const digits = parsed.customerId.replace(/\D/g, '');
		return digits || null;
	} catch {
		return null;
	}
}

@Controller('integrations/ads')
export class AdsController {
	constructor(
		private readonly registry: AdsAdapterRegistry,
		private readonly oauthState: AdsOAuthStateService,
		private readonly settings: SettingsService,
		private readonly tenantContext: TenantContextService
	) {}

	@Get('status')
	@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
	@RequireOrgPermission('settings', 'read')
	async status(@Req() req: FastifyRequest): Promise<AdConnectionsResponse> {
		const tenantId = getActiveOrgId(req);
		const items = await Promise.all(
			AD_PROVIDERS.map(async (provider) => this.buildStatus(tenantId, provider))
		);
		return { items };
	}

	@Patch('google/customer-id')
	@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Re-stores the credential with the given customer_id via storeCredential (upsert-by-provider); repeat calls converge to the same stored value — PUT-like semantics despite the PATCH verb.'
	)
	async updateGoogleCustomerId(
		@Req() req: FastifyRequest,
		@Body() body: unknown
	): Promise<AdConnectionStatus> {
		const tenantId = getActiveOrgId(req);
		const { customer_id } = adGoogleCustomerIdUpdate.parse(body);
		let secret: string;
		try {
			secret = await this.settings.loadCredentialSecret(tenantId, 'google');
		} catch {
			throw new BadRequestException('Google Ads is not connected');
		}

		let parsed: { refreshToken?: unknown; customerId?: unknown };
		try {
			parsed = JSON.parse(secret) as { refreshToken?: unknown; customerId?: unknown };
		} catch {
			throw new BadRequestException('Google credential is corrupt — reconnect OAuth');
		}
		if (typeof parsed.refreshToken !== 'string' || !parsed.refreshToken) {
			throw new BadRequestException('Google credential missing refresh token — reconnect OAuth');
		}

		await this.settings.storeCredential(tenantId, 'google', {
			secret: JSON.stringify({
				refreshToken: parsed.refreshToken,
				customerId: customer_id
			})
		});

		return this.buildStatus(tenantId, 'google');
	}

	@Get(':provider/authorize')
	@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
	@RequireOrgPermission('settings', 'update')
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
		return reply.redirect(`${webPublicUrl()}/settings/connections/ads?ads=${provider}`, 302);
	}

	@Delete(':provider')
	@HttpCode(204)
	@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'DELETE-by-provider; deleting an already-removed credential is a silent 0-row no-op, not an error — naturally idempotent.'
	)
	async disconnect(@Req() req: FastifyRequest, @Param('provider') providerParam: string) {
		const provider = this.registry.parseProvider(providerParam);
		await this.settings.deleteCredential(getActiveOrgId(req), provider);
	}

	private async buildStatus(
		tenantId: string,
		provider: AdProvider
	): Promise<AdConnectionStatus> {
		const cred = await this.settings.getCredentialStatus(tenantId, provider);
		const last_sync_date = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db
				.select({ last: max(adMetricsDaily.date) })
				.from(adMetricsDaily)
				.where(eq(adMetricsDaily.provider, provider));
			return row?.last ?? null;
		});

		let customer_id: string | null = null;
		if (cred.configured && provider === 'google') {
			try {
				const secret = await this.settings.loadCredentialSecret(tenantId, 'google');
				customer_id = parseGoogleCustomerId(secret);
			} catch {
				customer_id = null;
			}
		}

		return {
			provider,
			connected: cred.configured,
			key_version: cred.configured ? (cred.key_version ?? null) : null,
			last_sync_date,
			customer_id
		};
	}
}
