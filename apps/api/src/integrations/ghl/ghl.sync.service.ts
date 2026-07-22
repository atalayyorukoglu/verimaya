import { Injectable, Logger } from '@nestjs/common';
import { and, eq, ilike, isNull } from 'drizzle-orm';
import { writeAuditLog } from '../../common/audit-helper';
import { jobs, patients } from '../../db/schema';
import {
	GHL_INBOUND_SYNC_LOG_JOB_TYPE,
	GHL_RECONCILE_JOB_TYPE
} from '../../queue/queue.constants';
import { TenantContextService } from '../../tenant/tenant-context.service';
import {
	detectGhlEventKind,
	extractGhlContactFields,
	extractGhlExternalId,
	ghlContactNotesMarker
} from './ghl.mapper';
import type {
	GhlInboundEvent,
	GhlProcessResult,
	GhlSyncAction
} from './ghl.types';

const SYSTEM_ACTOR = {
	actorId: null,
	actorDisplayName: 'GHL sync (fixture)'
} as const;

/** Reject ids that would break note markers or ILIKE matching. */
function isSafeExternalId(value: string): boolean {
	return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}

/**
 * GHL sync (Faz 4, no OAuth). Parses fixture-shaped webhook payloads, writes a durable
 * sync log row into `jobs` (`ghl.inbound.sync`), and optionally upserts a minimal patient
 * when contact fields are clean. External-id mapping uses `patients.notes` marker
 * (`ghl_contact_id=<id>`) + `source='ghl'` — no new table/migration.
 */
@Injectable()
export class GhlSyncService {
	private readonly logger = new Logger(GhlSyncService.name);

	constructor(private readonly tenantContext: TenantContextService) {}

	/** Detects contact/opportunity from an inbound webhook payload (no writes). */
	parseInboundEvent(event: GhlInboundEvent): Omit<GhlProcessResult, 'action' | 'patientId'> {
		const kind = detectGhlEventKind(event.payload);
		const contact = extractGhlContactFields(event.payload);
		const externalId = extractGhlExternalId(event.payload, kind) ?? contact.externalId;
		const summary =
			kind === 'unknown'
				? `unrecognized GHL payload shape (event ${event.integrationEventId})`
				: `${kind} ${externalId ?? '(no id)'}`;

		return { kind, externalId, summary, contact };
	}

	/**
	 * Processes an inbound GHL event under the event's tenant: sync log + optional patient upsert.
	 * Isolation-safe via `withTenant` / RLS.
	 */
	async processInboundEvent(event: GhlInboundEvent): Promise<GhlProcessResult> {
		const parsed = this.parseInboundEvent(event);

		return this.tenantContext.withTenant(event.tenantId, async ({ db }) => {
			let action: GhlSyncAction = 'logged';
			let patientId: string | null = null;

			if (parsed.kind === 'unknown') {
				action = 'skipped_unknown';
			} else if (parsed.kind === 'contact' || parsed.contact?.fullName) {
				const contact = parsed.contact;
				const externalId = contact?.externalId ?? parsed.externalId;

				if (!contact?.fullName || !externalId || !isSafeExternalId(externalId)) {
					action = 'skipped_incomplete';
					this.logger.log(
						`GHL event ${event.integrationEventId}: incomplete/unsafe contact fields (need fullName+safe externalId)`
					);
				} else {
					const marker = ghlContactNotesMarker(externalId);
					const [existing] = await db
						.select()
						.from(patients)
						.where(
							and(
								eq(patients.source, 'ghl'),
								ilike(patients.notes, `%${marker}%`),
								isNull(patients.deletedAt)
							)
						)
						.limit(1);

					if (existing) {
						const [updated] = await db
							.update(patients)
							.set({
								fullName: contact.fullName,
								phone: contact.phone ?? existing.phone,
								email: contact.email ?? existing.email,
								updatedAt: new Date()
							})
							.where(eq(patients.id, existing.id))
							.returning();
						patientId = updated?.id ?? existing.id;
						action = 'patient_updated';
						await writeAuditLog(
							db,
							event.tenantId,
							SYSTEM_ACTOR,
							'update',
							'patient',
							contact.fullName
						);
					} else {
						const notes = `${marker} · imported from GHL fixture`;
						const [created] = await db
							.insert(patients)
							.values({
								tenantId: event.tenantId,
								fullName: contact.fullName,
								phone: contact.phone,
								email: contact.email,
								status: 'lead',
								source: 'ghl',
								notes
							})
							.returning();
						patientId = created?.id ?? null;
						action = 'patient_created';
						if (created) {
							await writeAuditLog(
								db,
								event.tenantId,
								SYSTEM_ACTOR,
								'create',
								'patient',
								contact.fullName
							);
						}
					}
				}
			}

			const summary = `${parsed.summary}; action=${action}${patientId ? ` patient=${patientId}` : ''}`;

			await db.insert(jobs).values({
				tenantId: event.tenantId,
				queue: 'default',
				jobType: GHL_INBOUND_SYNC_LOG_JOB_TYPE,
				payload: {
					integrationEventId: event.integrationEventId,
					kind: parsed.kind,
					externalId: parsed.externalId,
					action,
					patientId,
					contact: parsed.contact
				},
				status: 'completed',
				startedAt: new Date(),
				completedAt: new Date()
			});

			this.logger.log(
				`GHL event ${event.integrationEventId} (tenant ${event.tenantId}): ${summary}`
			);

			return {
				kind: parsed.kind,
				externalId: parsed.externalId,
				summary,
				action,
				patientId,
				contact: parsed.contact
			};
		});
	}

	/**
	 * `ghl.reconcile` job handler. Without OAuth there is no GHL API to pull from — writes a
	 * completed ledger row documenting the noop so ops can see the scheduler fired.
	 */
	async reconcile(tenantId: string): Promise<void> {
		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db.insert(jobs).values({
				tenantId,
				queue: 'default',
				jobType: GHL_RECONCILE_JOB_TYPE,
				payload: {
					mode: 'fixture',
					reason: 'no_oauth_adapter',
					message:
						'ghl.reconcile skipped API pull (no OAuth); inbound webhook fixture path handles contact upserts'
				},
				status: 'completed',
				startedAt: new Date(),
				completedAt: new Date()
			});
		});
		this.logger.debug(
			`ghl.reconcile fixture noop for tenant ${tenantId} (ledger row written; no OAuth adapter)`
		);
	}
}
