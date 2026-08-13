import {
	Controller,
	Delete,
	Get,
	HttpCode,
	Logger,
	Post,
	Query,
	Req,
	Res,
	UseGuards
} from '@nestjs/common';
import {
	ghlOAuthCallbackQuery,
	type GhlConnectionStatus,
	type GhlReconcileTriggerResult
} from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ActiveOrgGuard, getActiveOrgId } from '../../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../../common/auth-or-api-key.guard';
import { IdempotencyExempt } from '../../common/idempotent.decorator';
import { OrgPermissionGuard } from '../../common/org-permission.guard';
import { RequireOrgPermission } from '../../common/require-org-permission.decorator';
import { GHL_RECONCILE_JOB_TYPE } from '../../queue/queue.constants';
import { QueueService } from '../../queue/queue.service';
import { SettingsService } from '../../settings/settings.service';
import {
	ghlOAuthClientFromEnv,
	parseGhlStoredSecret,
	type GhlOAuthClient
} from './ghl-oauth.client';
import { GHL_OAUTH_PROVIDER, GhlOAuthStateService } from './ghl-oauth.state';
import { GhlReconcileService } from './ghl.reconcile.service';

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
	// Brand-neutral path required: GHL Marketplace rejects redirect URIs that
	// contain "ghl" / Highlevel references ("The redirect uri contains a Highlevel
	// reference"). Authorize + token exchange must use this same URI.
	return `${ghlRedirectBase()}/v1/integrations/crm/callback`;
}

/**
 * Tenant-scoped GHL connection surface. Class-level guard triad matches the dominant
 * controller pattern (AUDIT-F09-18). OAuth callback lives in GhlOAuthCallbackController.
 */
@Controller('integrations/ghl')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class GhlController {
	private readonly oauth: GhlOAuthClient;
	private readonly logger = new Logger(GhlController.name);

	constructor(
		private readonly oauthState: GhlOAuthStateService,
		private readonly settings: SettingsService,
		private readonly queue: QueueService,
		private readonly ghlReconcile: GhlReconcileService
	) {
		this.oauth = ghlOAuthClientFromEnv();
	}

	@Get('status')
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
	@RequireOrgPermission('settings', 'update')
	async authorize(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
		const tenantId = getActiveOrgId(req);
		const redirectUri = ghlCallbackRedirectUri();
		const state = this.oauthState.encodeState({ tenantId });
		const url = this.oauth.buildAuthorizeUrl({ state, redirectUri });
		return reply.redirect(url, 302);
	}

	/**
	 * Manual one-shot GHL→panel pull. Prefers BullMQ (`enqueueGhlReconcile`); if the queue
	 * is unavailable, runs {@link GhlReconcileService.reconcile} inline so the work is not
	 * silently lost. Never writes panel fields back to GHL.
	 */
	@Post('reconcile')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Ownership-aware GHL upserts converge on repeat (same as AdMetricsController.sync). In-flight BullMQ jobs for the same tenant are deduped before enqueue so a double-click does not stack work.'
	)
	async reconcile(
		@Req() req: FastifyRequest,
		@Res({ passthrough: true }) reply: FastifyReply
	): Promise<GhlReconcileTriggerResult> {
		const tenantId = getActiveOrgId(req);
		const queued = await this.tryEnqueueReconcile(tenantId);
		if (queued) {
			reply.status(202);
			return queued;
		}

		const result = await this.ghlReconcile.reconcile(tenantId);
		reply.status(200);
		return {
			status: 'completed',
			mode: result.mode,
			lookback_days: result.lookbackDays,
			scanned: result.scanned,
			created: result.created,
			updated: result.updated,
			unchanged: result.unchanged,
			skipped: result.skipped,
			diff_count: result.diffCount
		};
	}

	@Delete()
	@HttpCode(204)
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'DELETE-by-provider; deleting an already-removed credential is a silent 0-row no-op, not an error — naturally idempotent.'
	)
	async disconnect(@Req() req: FastifyRequest) {
		await this.settings.deleteCredential(getActiveOrgId(req), GHL_OAUTH_PROVIDER);
	}

	/**
	 * Returns a queued response when enqueue succeeds (or an in-flight job already exists).
	 * Returns null when the queue is down so the caller can run reconcile inline.
	 */
	private async tryEnqueueReconcile(
		tenantId: string
	): Promise<Extract<GhlReconcileTriggerResult, { status: 'queued' }> | null> {
		const queue = this.queue.getDefaultQueue();
		if (!queue) {
			this.logger.warn(
				`ghl.reconcile manual: default queue not ready — running inline for tenant=${tenantId}`
			);
			return null;
		}

		try {
			const inFlight = await queue.getJobs(['waiting', 'active', 'delayed', 'paused']);
			const existing = inFlight.find(
				(job) =>
					job.name === GHL_RECONCILE_JOB_TYPE && job.data.tenantId === tenantId
			);
			if (existing) {
				return {
					status: 'queued',
					job_id: String(existing.id),
					already_queued: true
				};
			}

			const job = await this.queue.enqueueGhlReconcile(tenantId);
			return {
				status: 'queued',
				job_id: String(job.id),
				already_queued: false
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.warn(
				`ghl.reconcile manual: enqueue failed (${message}) — running inline for tenant=${tenantId}`
			);
			return null;
		}
	}
}

/**
 * Public OAuth callback — provider redirects the browser here with `code`+`state`.
 * No session/API-key; tenant is recovered from signed OAuth state (AUDIT-F09-18 split).
 * Path is `integrations/crm` (not `ghl`) — GHL Marketplace brand restriction on redirect URIs.
 */
@Controller('integrations/crm')
export class GhlOAuthCallbackController {
	private readonly oauth: GhlOAuthClient;

	constructor(
		private readonly oauthState: GhlOAuthStateService,
		private readonly settings: SettingsService
	) {
		this.oauth = ghlOAuthClientFromEnv();
	}

	@Get('callback')
	async callback(
		@Res() reply: FastifyReply,
		@Query('code') code?: string,
		@Query('state') state?: string
	) {
		const query = ghlOAuthCallbackQuery.parse({ code, state });
		const payload = await this.oauthState.decodeState(query.state);
		const redirectUri = ghlCallbackRedirectUri();
		const { secret } = await this.oauth.exchangeCode({
			code: query.code,
			redirectUri
		});
		await this.settings.storeCredential(payload.tenantId, GHL_OAUTH_PROVIDER, { secret });
		return reply.redirect(`${webPublicUrl()}/settings/connections/ghl?ghl=connected`, 302);
	}
}
