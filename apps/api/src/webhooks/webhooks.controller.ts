import { createHash, randomUUID } from 'node:crypto';
import {
	BadRequestException,
	Controller,
	HttpCode,
	Param,
	Post,
	Req,
	UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { inboundMessages } from '../db/schema/inbound-messages';
import { integrationEvents, jobs } from '../db/schema/queue';
import { DEFAULT_QUEUE_NAME, QueueService } from '../queue/queue.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { extractWahaExternalId } from '../whatsapp/inbound-mapper';
import {
	extractRawBody,
	verifyWahaSignature,
	WAHA_SIGNATURE_HEADER,
	WAHA_TIMESTAMP_HEADER,
	type WebhookRequestWithRawBody
} from './webhooks.signature';

const STUB_SIGNATURE_HEADER = 'x-webhook-signature';
const TENANT_HEADER = 'x-tenant-id';
const EXTERNAL_EVENT_ID_HEADER = 'x-external-event-id';

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

function requireTenantId(request: FastifyRequest): string {
	const tenantId = request.headers[TENANT_HEADER];
	if (typeof tenantId !== 'string' || !tenantId.trim()) {
		throw new BadRequestException('Missing tenant header');
	}
	return tenantId.trim();
}

function parseJsonPayload(rawBody: string): Record<string, unknown> {
	try {
		return JSON.parse(rawBody) as Record<string, unknown>;
	} catch {
		throw new BadRequestException('Invalid JSON payload');
	}
}

function externalEventIdHeader(request: FastifyRequest): string | undefined {
	return typeof request.headers[EXTERNAL_EVENT_ID_HEADER] === 'string'
		? request.headers[EXTERNAL_EVENT_ID_HEADER]
		: undefined;
}

/** Generic provider webhooks — stub shared-secret equality (pre-HMAC). */
function validateStubWebhookRequest(request: FastifyRequest, config: ConfigService) {
	const signature = request.headers[STUB_SIGNATURE_HEADER];
	if (typeof signature !== 'string' || !signature.trim()) {
		throw new UnauthorizedException('Missing webhook signature');
	}

	const expectedSecret = config.get<string>('WEBHOOK_STUB_SECRET') ?? 'dev-webhook-secret';
	if (signature !== expectedSecret) {
		throw new UnauthorizedException('Invalid webhook signature');
	}

	const tenantId = requireTenantId(request);
	const rawBody = extractRawBody(request as WebhookRequestWithRawBody);
	const payloadHash = hashPayload(rawBody);
	const payload = parseJsonPayload(rawBody);

	return {
		tenantId,
		rawBody,
		payloadHash,
		payload,
		externalEventIdHeader: externalEventIdHeader(request)
	};
}

/** WAHA — HMAC-SHA256 of `${timestamp}.${rawBody}` + ±5 min window. */
function validateWahaWebhookRequest(request: FastifyRequest, config: ConfigService) {
	const secret = config.get<string>('WAHA_WEBHOOK_SECRET')?.trim() ?? '';
	const rawBody = extractRawBody(request as WebhookRequestWithRawBody);
	const signatureHeader = request.headers[WAHA_SIGNATURE_HEADER];
	const timestampHeader = request.headers[WAHA_TIMESTAMP_HEADER];

	verifyWahaSignature({
		rawBody,
		signatureHeader: typeof signatureHeader === 'string' ? signatureHeader : undefined,
		timestampHeader: typeof timestampHeader === 'string' ? timestampHeader : undefined,
		secret
	});

	const tenantId = requireTenantId(request);
	const payloadHash = hashPayload(rawBody);
	const payload = parseJsonPayload(rawBody);

	return {
		tenantId,
		rawBody,
		payloadHash,
		payload,
		externalEventIdHeader: externalEventIdHeader(request)
	};
}

@Controller('webhooks')
export class WebhooksController {
	constructor(
		private readonly config: ConfigService,
		private readonly tenantContext: TenantContextService,
		private readonly queue: QueueService
	) {}

	@Post('waha')
	@HttpCode(202)
	async ingestWaha(@Req() request: FastifyRequest) {
		const { tenantId, payloadHash, payload, externalEventIdHeader } = validateWahaWebhookRequest(
			request,
			this.config
		);

		const externalId = extractWahaExternalId(payload, payloadHash, externalEventIdHeader);
		const jobId = randomUUID();
		const inboundMessageId = randomUUID();

		const result = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [existing] = await db
				.select({ id: inboundMessages.id, status: inboundMessages.status })
				.from(inboundMessages)
				.where(
					and(eq(inboundMessages.provider, 'waha'), eq(inboundMessages.externalId, externalId))
				)
				.limit(1);

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
				jobType: 'inbound_message.process',
				payload: { inboundMessageId },
				status: 'pending'
			});

			return {
				duplicate: false as const,
				inboundMessageId,
				jobId
			};
		});

		if (!result.duplicate) {
			const bullJob = await this.queue.enqueueDefaultJob('inbound_message.process', {
				jobId: result.jobId,
				tenantId,
				jobType: 'inbound_message.process'
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

	@Post(':provider')
	@HttpCode(202)
	async ingest(@Param('provider') provider: string, @Req() request: FastifyRequest) {
		const { tenantId, payloadHash, payload, externalEventIdHeader } = validateStubWebhookRequest(
			request,
			this.config
		);

		const externalEventId = extractExternalEventId(payload, payloadHash, externalEventIdHeader);

		const normalizedProvider = provider.trim().toLowerCase();
		if (!normalizedProvider) {
			throw new BadRequestException('Provider is required');
		}

		const jobId = randomUUID();

		const result = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [existing] = await db
				.select({ id: integrationEvents.id, status: integrationEvents.status })
				.from(integrationEvents)
				.where(
					and(
						eq(integrationEvents.provider, normalizedProvider),
						eq(integrationEvents.externalEventId, externalEventId)
					)
				)
				.limit(1);

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
				provider: normalizedProvider,
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
					provider: normalizedProvider
				},
				status: 'pending'
			});

			return {
				duplicate: false as const,
				integrationEventId,
				jobId
			};
		});

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
}
