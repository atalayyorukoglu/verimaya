import { Injectable, Logger } from '@nestjs/common';
import { and, eq, ilike, isNull } from 'drizzle-orm';
import { writeAuditLog } from '../../common/audit-helper';
import { externalIds, jobs, patients } from '../../db/schema';
import {
	GHL_INBOUND_SYNC_LOG_JOB_TYPE
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
	GhlRemoteContact,
	GhlSyncAction
} from './ghl.types';

const SYSTEM_ACTOR = {
	actorId: null,
	actorDisplayName: 'GHL sync'
} as const;

const GHL_SOURCE = 'ghl';
const PATIENT_ENTITY = 'patient';

export type ApplyRemoteContactResult = {
	action: 'created' | 'updated' | 'unchanged' | 'skipped';
	patientId: string | null;
	changedFields: string[];
};

/** Reject ids that would break note markers or ILIKE matching. */
function isSafeExternalId(value: string): boolean {
	return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function normStr(value: string | null | undefined): string | null {
	if (value == null) return null;
	const t = value.trim();
	return t.length > 0 ? t : null;
}

function normEmail(value: string | null | undefined): string | null {
	const t = normStr(value);
	return t ? t.toLowerCase() : null;
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

	/**
	 * Ownership-aware upsert from a normalized remote contact (inbound + reconcile).
	 * Does not write the inbound sync ledger row — callers that need it do so themselves.
	 */
	async applyRemoteContact(
		tenantId: string,
		remote: GhlRemoteContact
	): Promise<ApplyRemoteContactResult> {
		const externalId = remote.id.trim();
		const fullName = normStr(remote.fullName);
		if (!fullName || !isSafeExternalId(externalId)) {
			return { action: 'skipped', patientId: null, changedFields: [] };
		}

		const ownedPatch = pickOwnedFields(
			{
				fullName,
				phone: normStr(remote.phone),
				email: normEmail(remote.email),
				status: 'scheduled',
				notes: 'ignored-by-ownership'
			},
			'ghl'
		);

		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const existingId = await this.resolvePatientId(db, externalId);

			if (existingId) {
				const [row] = await db
					.select({
						id: patients.id,
						fullName: patients.fullName,
						phone: patients.phone,
						email: patients.email,
						status: patients.status
					})
					.from(patients)
					.where(and(eq(patients.id, existingId), isNull(patients.deletedAt)))
					.limit(1);

				if (!row) {
					return { action: 'skipped', patientId: null, changedFields: [] };
				}

				const changedFields: string[] = [];
				const nextFullName = String(ownedPatch.fullName);
				if (row.fullName !== nextFullName) changedFields.push('fullName');

				const nextPhone =
					ownedPatch.phone != null ? String(ownedPatch.phone) : row.phone;
				if (normStr(row.phone) !== normStr(nextPhone)) changedFields.push('phone');

				const nextEmail =
					ownedPatch.email != null ? String(ownedPatch.email) : row.email;
				if (normEmail(row.email) !== normEmail(nextEmail)) changedFields.push('email');

				if (ownedPatch.status != null && row.status !== String(ownedPatch.status)) {
					changedFields.push('status');
				}

				if (changedFields.length === 0) {
					await this.ensureExternalId(db, tenantId, externalId, existingId);
					return { action: 'unchanged', patientId: existingId, changedFields: [] };
				}

				const [updated] = await db
					.update(patients)
					.set({
						fullName: nextFullName,
						phone: nextPhone,
						email: nextEmail,
						...(ownedPatch.status != null
							? { status: String(ownedPatch.status) }
							: {}),
						updatedAt: new Date()
					})
					.where(eq(patients.id, existingId))
					.returning();

				const patientId = updated?.id ?? existingId;
				await this.ensureExternalId(db, tenantId, externalId, patientId);
				await writeAuditLog(db, tenantId, SYSTEM_ACTOR, 'update', 'patient', nextFullName);
				return { action: 'updated', patientId, changedFields };
			}

			const [created] = await db
				.insert(patients)
				.values({
					tenantId,
					fullName: String(ownedPatch.fullName),
					phone: ownedPatch.phone != null ? String(ownedPatch.phone) : null,
					email: ownedPatch.email != null ? String(ownedPatch.email) : null,
					status: String(ownedPatch.status ?? 'scheduled'),
					source: GHL_SOURCE,
					notes: null
				})
				.returning();

			if (!created) {
				return { action: 'skipped', patientId: null, changedFields: [] };
			}

			await this.ensureExternalId(db, tenantId, externalId, created.id);
			await writeAuditLog(
				db,
				tenantId,
				SYSTEM_ACTOR,
				'create',
				'patient',
				created.fullName
			);
			return {
				action: 'created',
				patientId: created.id,
				changedFields: ['fullName', 'phone', 'email', 'status']
			};
		});
	}

	async processInboundEvent(event: GhlInboundEvent): Promise<GhlProcessResult> {
		const parsed = this.parseInboundEvent(event);

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
				const applied = await this.applyRemoteContact(event.tenantId, {
					id: externalId,
					locationId: null,
					fullName: contact.fullName,
					phone: contact.phone,
					email: contact.email,
					dateUpdated: null
				});
				patientId = applied.patientId;
				if (applied.action === 'created') action = 'patient_created';
				else if (applied.action === 'updated') action = 'patient_updated';
				else if (applied.action === 'unchanged') action = 'logged';
				else action = 'skipped_incomplete';
			}
		}

		const summary = `${parsed.summary}; action=${action}${patientId ? ` patient=${patientId}` : ''}`;

		await this.tenantContext.withTenant(event.tenantId, async ({ db }) => {
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
