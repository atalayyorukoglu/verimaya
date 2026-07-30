import { Injectable, Logger } from '@nestjs/common';
import { and, eq, ilike, isNull } from 'drizzle-orm';
import { writeAuditLog } from '../../common/audit-helper';
import { externalIds, jobs, patients } from '../../db/schema';
import {
	GHL_INBOUND_SYNC_LOG_JOB_TYPE,
	GHL_RECONCILE_JOB_TYPE
} from '../../queue/queue.constants';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { pickOwnedFields } from './ghl.field-ownership';
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
	actorDisplayName: 'GHL sync'
} as const;

const GHL_SOURCE = 'ghl';
const PATIENT_ENTITY = 'patient';

/** Reject ids that would break note markers or ILIKE matching. */
function isSafeExternalId(value: string): boolean {
	return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}

type TenantDb = Parameters<Parameters<TenantContextService['withTenant']>[1]>[0]['db'];

/**
 * GHL sync: inbound webhook → jobs ledger + patient upsert via `external_ids`
 * (source=ghl). Legacy `ghl_contact_id=` notes markers are still readable until
 * `migrate-ghl-markers` runs; new writes do not add markers (Adım 42).
 */
@Injectable()
export class GhlSyncService {
	private readonly logger = new Logger(GhlSyncService.name);

	constructor(private readonly tenantContext: TenantContextService) {}

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
					const existingId = await this.resolvePatientId(db, externalId);

					const ownedPatch = pickOwnedFields(
						{
							fullName: contact.fullName,
							phone: contact.phone,
							email: contact.email,
							status: 'lead',
							notes: 'ignored-by-ownership'
						},
						'ghl'
					);

					if (existingId) {
						const [updated] = await db
							.update(patients)
							.set({
								fullName: String(ownedPatch.fullName),
								phone:
									ownedPatch.phone != null
										? String(ownedPatch.phone)
										: undefined,
								email:
									ownedPatch.email != null
										? String(ownedPatch.email)
										: undefined,
								...(ownedPatch.status != null
									? { status: String(ownedPatch.status) }
									: {}),
								updatedAt: new Date()
							})
							.where(eq(patients.id, existingId))
							.returning();
						patientId = updated?.id ?? existingId;
						action = 'patient_updated';
						await this.ensureExternalId(db, event.tenantId, externalId, patientId);
						await writeAuditLog(
							db,
							event.tenantId,
							SYSTEM_ACTOR,
							'update',
							'patient',
							contact.fullName
						);
					} else {
						const [created] = await db
							.insert(patients)
							.values({
								tenantId: event.tenantId,
								fullName: String(ownedPatch.fullName),
								phone:
									ownedPatch.phone != null ? String(ownedPatch.phone) : null,
								email:
									ownedPatch.email != null ? String(ownedPatch.email) : null,
								status: String(ownedPatch.status ?? 'lead'),
								source: GHL_SOURCE,
								notes: null
							})
							.returning();
						patientId = created?.id ?? null;
						action = 'patient_created';
						if (created) {
							await this.ensureExternalId(
								db,
								event.tenantId,
								externalId,
								created.id
							);
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

	/** Prefer external_ids; fall back to legacy notes marker (read-only). */
	private async resolvePatientId(db: TenantDb, externalId: string): Promise<string | null> {
		const [mapped] = await db
			.select({ internalId: externalIds.internalId })
			.from(externalIds)
			.where(
				and(
					eq(externalIds.source, GHL_SOURCE),
					eq(externalIds.entityType, PATIENT_ENTITY),
					eq(externalIds.externalId, externalId)
				)
			)
			.limit(1);
		if (mapped?.internalId) return mapped.internalId;

		const marker = ghlContactNotesMarker(externalId);
		const [legacy] = await db
			.select({ id: patients.id })
			.from(patients)
			.where(
				and(
					eq(patients.source, GHL_SOURCE),
					ilike(patients.notes, `%${marker}%`),
					isNull(patients.deletedAt)
				)
			)
			.limit(1);
		return legacy?.id ?? null;
	}

	private async ensureExternalId(
		db: TenantDb,
		tenantId: string,
		externalId: string,
		internalId: string
	): Promise<void> {
		const [existing] = await db
			.select({ id: externalIds.id })
			.from(externalIds)
			.where(
				and(
					eq(externalIds.source, GHL_SOURCE),
					eq(externalIds.entityType, PATIENT_ENTITY),
					eq(externalIds.externalId, externalId)
				)
			)
			.limit(1);
		if (existing) return;

		await db.insert(externalIds).values({
			tenantId,
			source: GHL_SOURCE,
			entityType: PATIENT_ENTITY,
			externalId,
			internalId
		});
	}
}
