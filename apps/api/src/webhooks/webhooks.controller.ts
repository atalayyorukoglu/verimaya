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
import { integrationEvents, jobs } from '../db/schema/queue';
import { DEFAULT_QUEUE_NAME, QueueService } from '../queue/queue.service';
import { TenantContextService } from '../tenant/tenant-context.service';

const SIGNATURE_HEADER = 'x-webhook-signature';
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

@Controller('webhooks')
export class WebhooksController {
	constructor(
		private readonly config: ConfigService,
		private readonly tenantContext: TenantContextService,
		private readonly queue: QueueService
	) {}

	@Post(':provider')
	@HttpCode(202)
	async ingest(@Param('provider') provider: string, @Req() request: FastifyRequest) {
		const signature = request.headers[SIGNATURE_HEADER];
		if (typeof signature !== 'string' || !signature.trim()) {
			throw new UnauthorizedException('Missing webhook signature');
		}

		const expectedSecret =
			this.config.get<string>('WEBHOOK_STUB_SECRET') ?? 'dev-webhook-secret';
		if (signature !== expectedSecret) {
			throw new UnauthorizedException('Invalid webhook signature');
		}

		const tenantId = request.headers[TENANT_HEADER];
		if (typeof tenantId !== 'string' || !tenantId.trim()) {
			throw new BadRequestException('Missing tenant header');
		}

		const rawBody =
			typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
		const payloadHash = hashPayload(rawBody);

		let payload: Record<string, unknown>;
		try {
			payload = JSON.parse(rawBody) as Record<string, unknown>;
		} catch {
			throw new BadRequestException('Invalid JSON payload');
		}

		const externalEventId = extractExternalEventId(
			payload,
			payloadHash,
			typeof request.headers[EXTERNAL_EVENT_ID_HEADER] === 'string'
				? request.headers[EXTERNAL_EVENT_ID_HEADER]
				: undefined
		);

		const normalizedProvider = provider.trim().toLowerCase();
		if (!normalizedProvider) {
			throw new BadRequestException('Provider is required');
		}

		const trimmedTenantId = tenantId.trim();
		const jobId = randomUUID();

		const result = await this.tenantContext.withTenant(trimmedTenantId, async ({ db }) => {
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
				tenantId: trimmedTenantId,
				provider: normalizedProvider,
				externalEventId,
				payloadHash,
				payload,
				status: 'queued'
			});

			await db.insert(jobs).values({
				id: jobId,
				tenantId: trimmedTenantId,
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
				tenantId: trimmedTenantId,
				jobType: 'integration_event.process'
			});

			await this.tenantContext.withTenant(trimmedTenantId, async ({ db }) => {
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
