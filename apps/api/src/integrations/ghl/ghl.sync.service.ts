import { Injectable, Logger } from '@nestjs/common';
import { and, eq, ilike, isNull } from 'drizzle-orm';
import { writeAuditLog } from '../../common/audit-helper';
import { contactTypes, contacts, externalIds, jobs } from '../../db/schema';
import { GHL_INBOUND_SYNC_LOG_JOB_TYPE } from '../../queue/queue.constants';
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
/** DOMAIN-02: external_ids.entity_type for people is `contact` (§0 / C6). */
const CONTACT_ENTITY = 'contact';

export type ApplyRemoteContactResult = {
	action: 'created' | 'updated' | 'unchanged' | 'skipped';
	contactId: string | null;
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

/** Split GHL full name → first / last (rest). Single token → lastName null. */
function splitPersonName(fullName: string): { firstName: string; lastName: string | null } {
	const parts = fullName.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return { firstName: fullName, lastName: null };
	if (parts.length === 1) return { firstName: parts[0]!, lastName: null };
	return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

/**
 * Name write priority: (1) GHL separate first/last as-is; (2) else split combined.
 * Does not alter casing. displayName follows today's rule (= fullName source).
 */
function resolvePersonName(remote: GhlRemoteContact): {
	firstName: string | null;
	lastName: string | null;
	displayName: string;
} | null {
	const first = normStr(remote.firstName);
	const last = normStr(remote.lastName);
	const combined = normStr(remote.fullName);

	if (first != null || last != null) {
		const fromParts = [first, last].filter(Boolean).join(' ').trim();
		const displayName = fromParts || combined;
		if (!displayName) return null;
		return { firstName: first, lastName: last, displayName };
	}

	if (!combined) return null;
	const split = splitPersonName(combined);
	return { firstName: split.firstName, lastName: split.lastName, displayName: combined };
}

type TenantDb = Parameters<Parameters<TenantContextService['withTenant']>[1]>[0]['db'];

/**
 * GHL sync: inbound webhook → jobs ledger + contact upsert via `external_ids`
 * (source=ghl, entity_type=contact). Legacy notes markers readable until
 * `migrate-ghl-markers` runs.
 */
@Injectable()
export class GhlSyncService {
	private readonly logger = new Logger(GhlSyncService.name);

	constructor(private readonly tenantContext: TenantContextService) {}

	parseInboundEvent(event: GhlInboundEvent): Omit<GhlProcessResult, 'action' | 'contactId'> {
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
	 * Writes `contacts` (Hasta type). Does not write the inbound sync ledger row.
	 */
	async applyRemoteContact(
		tenantId: string,
		remote: GhlRemoteContact
	): Promise<ApplyRemoteContactResult> {
		const externalId = remote.id.trim();
		const resolved = resolvePersonName(remote);
		if (!resolved || !isSafeExternalId(externalId)) {
			return { action: 'skipped', contactId: null, changedFields: [] };
		}

		const { firstName: nextFirst, lastName: nextLast, displayName: nextFullName } = resolved;

		const ownedPatch = pickOwnedFields(
			{
				fullName: nextFullName,
				phone: normStr(remote.phone),
				email: normEmail(remote.email),
				status: 'scheduled',
				notes: 'ignored-by-ownership'
			},
			'ghl'
		);

		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const existingId = await this.resolveContactId(db, externalId);

			if (existingId) {
				const [row] = await db
					.select({
						id: contacts.id,
						firstName: contacts.firstName,
						lastName: contacts.lastName,
						displayName: contacts.displayName,
						phone: contacts.phone,
						email: contacts.email,
						status: contacts.status
					})
					.from(contacts)
					.where(and(eq(contacts.id, existingId), isNull(contacts.deletedAt)))
					.limit(1);

				if (!row) {
					return { action: 'skipped', contactId: null, changedFields: [] };
				}

				const changedFields: string[] = [];
				const nameChanged =
					row.displayName !== nextFullName ||
					normStr(row.firstName) !== nextFirst ||
					normStr(row.lastName) !== nextLast;
				if (nameChanged) changedFields.push('fullName');

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
					return { action: 'unchanged', contactId: existingId, changedFields: [] };
				}

				const [updated] = await db
					.update(contacts)
					.set({
						firstName: nextFirst,
						lastName: nextLast,
						displayName: nextFullName,
						phone: nextPhone,
						email: nextEmail,
						...(ownedPatch.status != null
							? { status: String(ownedPatch.status) }
							: {}),
						updatedAt: new Date()
					})
					.where(eq(contacts.id, existingId))
					.returning();

				const contactId = updated?.id ?? existingId;
				await this.ensureExternalId(db, tenantId, externalId, contactId);
				await writeAuditLog(db, tenantId, SYSTEM_ACTOR, 'update', 'contact', nextFullName);
				return { action: 'updated', contactId: contactId, changedFields };
			}

			const hastaType = await this.requireHastaType(db, tenantId);
			const displayName = nextFullName;

			const [created] = await db
				.insert(contacts)
				.values({
					tenantId,
					contactTypeId: hastaType.id,
					contactTypeName: hastaType.name,
					firstName: nextFirst,
					lastName: nextLast,
					displayName,
					phone: ownedPatch.phone != null ? String(ownedPatch.phone) : null,
					email: ownedPatch.email != null ? String(ownedPatch.email) : null,
					status: String(ownedPatch.status ?? 'scheduled'),
					source: GHL_SOURCE,
					notes: null
				})
				.returning();

			if (!created) {
				return { action: 'skipped', contactId: null, changedFields: [] };
			}

			await this.ensureExternalId(db, tenantId, externalId, created.id);
			await writeAuditLog(
				db,
				tenantId,
				SYSTEM_ACTOR,
				'create',
				'contact',
				created.displayName
			);
			return {
				action: 'created',
				contactId: created.id,
				changedFields: ['fullName', 'phone', 'email', 'status']
			};
		});
	}

	async processInboundEvent(event: GhlInboundEvent): Promise<GhlProcessResult> {
		const parsed = this.parseInboundEvent(event);

		let action: GhlSyncAction = 'logged';
		let contactId: string | null = null;

		if (parsed.kind === 'unknown') {
			action = 'skipped_unknown';
		} else if (parsed.kind === 'contact' || parsed.contact?.fullName || parsed.contact?.firstName) {
			const contact = parsed.contact;
			const externalId = contact?.externalId ?? parsed.externalId;
			const hasName = Boolean(contact?.fullName || contact?.firstName || contact?.lastName);

			if (!hasName || !externalId || !isSafeExternalId(externalId)) {
				action = 'skipped_incomplete';
				this.logger.log(
					`GHL event ${event.integrationEventId}: incomplete/unsafe contact fields (need name+safe externalId)`
				);
			} else {
				const applied = await this.applyRemoteContact(event.tenantId, {
					id: externalId,
					locationId: null,
					firstName: contact!.firstName,
					lastName: contact!.lastName,
					fullName: contact!.fullName,
					phone: contact!.phone,
					email: contact!.email,
					dateUpdated: null
				});
				contactId = applied.contactId;
				if (applied.action === 'created') action = 'contact_created';
				else if (applied.action === 'updated') action = 'contact_updated';
				else if (applied.action === 'unchanged') action = 'logged';
				else action = 'skipped_incomplete';
			}
		}

		const summary = `${parsed.summary}; action=${action}${contactId ? ` contact=${contactId}` : ''}`;

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
					contactId,
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
			contactId,
			contact: parsed.contact
		};
	}

	/** Prefer external_ids; fall back to legacy notes marker (read-only). */
	private async resolveContactId(db: TenantDb, externalId: string): Promise<string | null> {
		const [mapped] = await db
			.select({ internalId: externalIds.internalId })
			.from(externalIds)
			.where(
				and(
					eq(externalIds.source, GHL_SOURCE),
					eq(externalIds.entityType, CONTACT_ENTITY),
					eq(externalIds.externalId, externalId)
				)
			)
			.limit(1);
		if (mapped?.internalId) return mapped.internalId;

		const marker = ghlContactNotesMarker(externalId);
		const [legacy] = await db
			.select({ id: contacts.id })
			.from(contacts)
			.where(
				and(
					eq(contacts.source, GHL_SOURCE),
					ilike(contacts.notes, `%${marker}%`),
					isNull(contacts.deletedAt)
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
					eq(externalIds.entityType, CONTACT_ENTITY),
					eq(externalIds.externalId, externalId)
				)
			)
			.limit(1);
		if (existing) return;

		await db.insert(externalIds).values({
			tenantId,
			source: GHL_SOURCE,
			entityType: CONTACT_ENTITY,
			externalId,
			internalId
		});
	}

	private async requireHastaType(db: TenantDb, tenantId: string) {
		const [existing] = await db
			.select({ id: contactTypes.id, name: contactTypes.name })
			.from(contactTypes)
			.where(eq(contactTypes.name, 'Hasta'))
			.limit(1);
		if (existing) return existing;

		const [created] = await db
			.insert(contactTypes)
			.values({ tenantId, name: 'Hasta', sortOrder: 0 })
			.returning({ id: contactTypes.id, name: contactTypes.name });
		if (!created) {
			throw new Error('Failed to create contact type "Hasta"');
		}
		return created;
	}
}
