import { createHash, randomUUID } from 'node:crypto';
import {
	BadRequestException,
	Controller,
	HttpCode,
	Param,
	Post,
	Req
} from '@nestjs/common';
import { and, eq, sql as drizzleSql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { IdempotencyExempt } from '../common/idempotent.decorator';
import { isUniqueViolation } from '../common/postgres-errors';
import { inboundMessages } from '../db/schema/inbound-messages';
import { integrationEvents, jobs } from '../db/schema/queue';
import { DbService } from '../db/db.service';
import { DEFAULT_QUEUE_NAME, QueueService } from '../queue/queue.service';
import { INBOUND_MESSAGE_PROCESS_JOB_TYPE } from '../queue/queue.constants';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { extractWahaExternalId } from '../whatsapp/inbound-mapper';
import { extractRawBody, type WebhookRequestWithRawBody } from './webhooks.signature';
import {
	resolveTenantFromWebhook,
	WEBHOOK_EXTERNAL_EVENT_ID_HEADER,
	WEBHOOK_SIGNATURE_HEADER,
	WEBHOOK_TENANT_HEADER,
	WEBHOOK_TIMESTAMP_HEADER
} from './webhooks.identity';

/** Must match the unique index names in db/schema/{inbound-messages,queue}.ts (EVENT-01, Faz 4.2). */
const INBOUND_MESSAGE_UNIQUE_INDEX = 'inbound_messages_tenant_provider_external_uidx';
const INTEGRATION_EVENT_UNIQUE_INDEX = 'integration_events_tenant_provider_external_uidx';

/**
 * Faz 7 denetim bulgusu (F-03): aynı olayın iki eşzamanlı teslimi select-then-insert
 * penceresinde yarışıp ikisi de "yok" görüyordu; kaybedenin transaction'ı geri alınsa da
 * ham 23505 yüzeye çıkıyordu. Transaction-ömürlü advisory lock ikinci teslimi birincinin
 * commit'ine kadar bekletir — sonra duplicate satırı görür ve queue'ya ikinci kez iş
 * basılmaz. Kilit commit/rollback ile otomatik bırakılır; kapsam yalnız bu olay kimliği.
 */
function eventLockIdentity(tenantId: string, provider: string, externalId: string) {
	return ['webhook', tenantId, provider, externalId].join('|');
}

function hashPayload(rawBody: string): string {
	return createHash('sha256').update(rawBody).digest('hex');
}

function extractExternalEventId(
	payload: Record<string, unknown>,
	payloadHash: string,
	headerValue: string | undefined
): string {
	if (headerValue?.trim()) {
		return headerValue.trim();
	}

	for (const key of ['id', 'event_id', 'eventId', 'external_event_id']) {
		const value = payload[key];
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}

	return payloadHash;
}

function parseJsonPayload(rawBody: string): Record<string, unknown> {
	try {
		return JSON.parse(rawBody) as Record<string, unknown>;
	} catch {
		throw new BadRequestException('Invalid JSON payload');
	}
}

function externalEventIdHeader(request: FastifyRequest): string | undefined {
	return typeof request.headers[WEBHOOK_EXTERNAL_EVENT_ID_HEADER] === 'string'
		? request.headers[WEBHOOK_EXTERNAL_EVENT_ID_HEADER]
		: undefined;
}

function tenantHeaderValue(request: FastifyRequest): string | undefined {
	return typeof request.headers[WEBHOOK_TENANT_HEADER] === 'string'
		? request.headers[WEBHOOK_TENANT_HEADER]
		: undefined;
}

function timestampHeaderValue(request: FastifyRequest): string | undefined {
	return typeof request.headers[WEBHOOK_TIMESTAMP_HEADER] === 'string'
		? request.headers[WEBHOOK_TIMESTAMP_HEADER]
		: undefined;
}

function signatureHeaderValue(request: FastifyRequest): string | undefined {
	return typeof request.headers[WEBHOOK_SIGNATURE_HEADER] === 'string'
		? request.headers[WEBHOOK_SIGNATURE_HEADER]
		: undefined;
}

function wahaResponse(result: {
	accepted: boolean;
	duplicate: boolean;
	inbound_message_id: string;
	job_id: string | undefined;
}): {
	accepted: boolean;
	duplicate: boolean;
	inbound_message_id: string;
	job_id: string | undefined;
} {
	return result;
}

function providerResponse(result: {
	accepted: boolean;
	duplicate: boolean;
	integration_event_id: string;
	job_id: string | undefined;
}): {
	accepted: boolean;
	duplicate: boolean;
	integration_event_id: string;
	job_id: string | undefined;
} {
	return result;
}

/**
 * Inbound provider webhook receivers — HMAC-signed, no Idempotency-Key header (providers don't
 * send one). Dedup is via provider event id against integration_events/inbound_messages unique
 * constraints (EVENT-01, Faz 4.2), not IdempotencyService (IDEM-01, Faz 4.1's mandatory-coverage
 * inventory — see idempotency-coverage.spec.ts — needs this documented, not IdempotencyService-wired).
 *
 * WEBHOOK-01 (Faz 8): tenant resolution moved from X-Tenant-Id header to per-tenant
 * `tenant_provider_identities` rows (see webhooks.identity.ts). The header is now treated
 * as an untrusted claim; the canonical tenant comes from the resolved identity. The
 * `X-Tenant-Id` value is still included in the HMAC signed payload so a signature
 * generated for tenant A is invalid when the request is presented for tenant B.
 */
@Controller('webhooks')
@IdempotencyExempt(
	'Inbound provider webhook receiver — providers never send our Idempotency-Key header. Dedup is via provider event id (EVENT-01: integration_events/inbound_messages unique constraints + graceful 23505 handling below), not IdempotencyService.'
)
export class WebhooksController {
	constructor(
		private readonly db: DbService,
		private readonly tenantContext: TenantContextService,
		private readonly queue: QueueService
	) {}

	@Post('waha')
	@HttpCode(202)
	async ingestWaha(@Req() request: FastifyRequest): Promise<ReturnType<typeof wahaResponse>> {
		const result = await this.ingestFor(request, 'waha');
		if (result.kind !== 'waha') {
			throw new Error('internal: waha route returned generic shape');
		}
		const { kind, ...waha } = result;
		return wahaResponse(waha);
	}

	@Post(':provider')
	@HttpCode(202)
	async ingest(
		@Param('provider') provider: string,
		@Req() request: FastifyRequest
	): Promise<ReturnType<typeof providerResponse>> {
		const normalizedProvider = provider.trim().toLowerCase();
		if (!normalizedProvider) {
			throw new BadRequestException('Provider is required');
		}
		const result = await this.ingestFor(request, normalizedProvider);
		if (result.kind !== 'generic') {
			throw new Error('internal: generic route returned waha shape');
		}
		const { kind, ...generic } = result;
		return providerResponse(generic);
	}

	/**
	 * WEBHOOK-01 (Faz 8): shared ingestion pipeline. Resolves canonical tenant from the
	 * signature (NOT from the X-Tenant-Id header), then runs the queue-first ingest path.
	 */
	private async ingestFor(request: FastifyRequest, provider: string) {
		const rawBody = extractRawBody(request as WebhookRequestWithRawBody);

		// WEBHOOK-01: resolve canonical tenantId via signature + identity. Throws
		// UnauthorizedException on signature mismatch, missing identity, or
		// header-vs-identity tenant mismatch (cross-tenant spoof).
		const resolved = await resolveTenantFromWebhook({
			db: this.db,
			provider,
			rawBody,
			signatureHeader: signatureHeaderValue(request),
			timestampHeader: timestampHeaderValue(request),
			claimedTenantId: tenantHeaderValue(request)
		});
		const tenantId = resolved.tenantId;

		const payloadHash = hashPayload(rawBody);
		const payload = parseJsonPayload(rawBody);
		const externalEventId = externalEventIdHeader(request);

		if (provider === 'waha') {
			const waha = await this.processWaha({
				tenantId,
				payload,
				payloadHash,
				externalEventIdHeader: externalEventId,
				rawBody
			});
			return { kind: 'waha' as const, ...waha };
		}
		const generic = await this.processGenericProvider({
			tenantId,
			provider,
			payload,
			payloadHash,
			externalEventIdHeader: externalEventId
		});
		return { kind: 'generic' as const, ...generic };
	}

	private async processWaha(args: {
		tenantId: string;
		payload: Record<string, unknown>;
		payloadHash: string;
		externalEventIdHeader: string | undefined;
		rawBody: string;
	}) {
		const { tenantId, payload, payloadHash, externalEventIdHeader } = args;
		const externalId = extractWahaExternalId(payload, payloadHash, externalEventIdHeader);
		const jobId = randomUUID();
		const inboundMessageId = randomUUID();

		type IngestWahaResult =
			| { duplicate: true; inboundMessageId: string; status: string }
			| { duplicate: false; inboundMessageId: string; jobId: string };

		let result: IngestWahaResult;
		try {
			result = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
				await db.execute(
					drizzleSql`select pg_advisory_xact_lock(hashtextextended(${eventLockIdentity(tenantId, 'waha', externalId)}, 0))`
				);

				const existing = await this.findInboundMessage(db, externalId);
				if (existing) {
					return {
						duplicate: true as const,
						inboundMessageId: existing.id,
						status: existing.status
					};
				}

				await db.insert(inboundMessages).values({
					id: inboundMessageId,
					tenantId,
					provider: 'waha',
					externalId,
					payload,
					status: 'new'
				});

				await db.insert(jobs).values({
					id: jobId,
					tenantId,
					queue: DEFAULT_QUEUE_NAME,
					jobType: INBOUND_MESSAGE_PROCESS_JOB_TYPE,
					payload: { inboundMessageId },
					status: 'pending'
				});

				return {
					duplicate: false as const,
					inboundMessageId,
					jobId
				};
			});
		} catch (err) {
			// EVENT-01: concurrent duplicate — two deliveries of the same tenant+provider+external_id
			// raced the select-then-insert above. Postgres already rolled back the loser's whole
			// transaction; re-read the winner's row instead of surfacing the raw 500.
			if (!isUniqueViolation(err, INBOUND_MESSAGE_UNIQUE_INDEX)) throw err;

			const existing = await this.tenantContext.withTenant(tenantId, ({ db }) =>
				this.findInboundMessage(db, externalId)
			);
			if (!existing) throw err;
			result = { duplicate: true, inboundMessageId: existing.id, status: existing.status };
		}

		if (!result.duplicate) {
			const bullJob = await this.queue.enqueueDefaultJob(INBOUND_MESSAGE_PROCESS_JOB_TYPE, {
				jobId: result.jobId,
				tenantId,
				jobType: INBOUND_MESSAGE_PROCESS_JOB_TYPE
			});

			await this.tenantContext.withTenant(tenantId, async ({ db }) => {
				await db
					.update(jobs)
					.set({ bullmqJobId: bullJob.id ?? null, updatedAt: new Date() })
					.where(eq(jobs.id, result.jobId));
			});
		}

		return {
			accepted: true,
			duplicate: result.duplicate,
			inbound_message_id: result.inboundMessageId,
			job_id: result.duplicate ? undefined : result.jobId
		};
	}

	private async processGenericProvider(args: {
		tenantId: string;
		provider: string;
		payload: Record<string, unknown>;
		payloadHash: string;
		externalEventIdHeader: string | undefined;
	}) {
		const { tenantId, provider, payload, payloadHash, externalEventIdHeader } = args;
		const externalEventId = extractExternalEventId(payload, payloadHash, externalEventIdHeader);

		const jobId = randomUUID();

		type IngestResult =
			| { duplicate: true; integrationEventId: string; status: string }
			| { duplicate: false; integrationEventId: string; jobId: string };

		let result: IngestResult;
		try {
			result = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
				await db.execute(
					drizzleSql`select pg_advisory_xact_lock(hashtextextended(${eventLockIdentity(tenantId, provider, externalEventId)}, 0))`
				);

				const existing = await this.findIntegrationEvent(db, provider, externalEventId);
				if (existing) {
					return {
						duplicate: true as const,
						integrationEventId: existing.id,
						status: existing.status
					};
				}

				const integrationEventId = randomUUID();

				await db.insert(integrationEvents).values({
					id: integrationEventId,
					tenantId,
					provider,
					externalEventId,
					payloadHash,
					payload,
					status: 'queued'
				});

				await db.insert(jobs).values({
					id: jobId,
					tenantId,
					queue: DEFAULT_QUEUE_NAME,
					jobType: 'integration_event.process',
					payload: {
						integrationEventId,
						provider
					},
					status: 'pending'
				});

				return {
					duplicate: false as const,
					integrationEventId,
					jobId
				};
			});
		} catch (err) {
			// EVENT-01: concurrent duplicate — two requests with the same tenant+provider+
			// external_event_id raced the select-then-insert above and both passed the
			// "not found" check. Postgres has already rolled back the loser's whole transaction
			// (both inserts); re-read the winner's row instead of surfacing the raw 500. This is
			// distinct from the cross-tenant case the widened unique index fixes: two *different*
			// tenants never collide here in the first place, since the index is tenant-scoped.
			if (!isUniqueViolation(err, INTEGRATION_EVENT_UNIQUE_INDEX)) throw err;

			const existing = await this.tenantContext.withTenant(tenantId, ({ db }) =>
				this.findIntegrationEvent(db, provider, externalEventId)
			);
			if (!existing) throw err;
			result = { duplicate: true, integrationEventId: existing.id, status: existing.status };
		}

		if (!result.duplicate) {
			const bullJob = await this.queue.enqueueDefaultJob('integration_event.process', {
				jobId: result.jobId,
				tenantId,
				jobType: 'integration_event.process'
			});

			await this.tenantContext.withTenant(tenantId, async ({ db }) => {
				await db
					.update(jobs)
					.set({ bullmqJobId: bullJob.id ?? null, updatedAt: new Date() })
					.where(eq(jobs.id, result.jobId));
			});
		}

		return {
			accepted: true,
			duplicate: result.duplicate,
			integration_event_id: result.integrationEventId,
			job_id: result.duplicate ? undefined : result.jobId
		};
	}

	/** RLS (tenant_context) already scopes this to the caller's tenant — see TenantContextService. */
	private async findInboundMessage(db: TenantDb, externalId: string) {
		const [row] = await db
			.select({ id: inboundMessages.id, status: inboundMessages.status })
			.from(inboundMessages)
			.where(and(eq(inboundMessages.provider, 'waha'), eq(inboundMessages.externalId, externalId)))
			.limit(1);
		return row;
	}

	/** RLS (tenant_context) already scopes this to the caller's tenant — see TenantContextService. */
	private async findIntegrationEvent(db: TenantDb, provider: string, externalEventId: string) {
		const [row] = await db
			.select({ id: integrationEvents.id, status: integrationEvents.status })
			.from(integrationEvents)
			.where(
				and(
					eq(integrationEvents.provider, provider),
					eq(integrationEvents.externalEventId, externalEventId)
				)
			)
			.limit(1);
		return row;
	}
}