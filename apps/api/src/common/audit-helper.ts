import type { AuditAction, AuditEntity } from '@verimaya/shared';
import { auditLogs } from '../db/schema';
import type { TenantDb } from '../tenant/tenant-context.service';

export type AuditActor = {
	actorId: string | null;
	actorDisplayName: string;
};

export async function writeAuditLog(
	db: TenantDb,
	tenantId: string,
	actor: AuditActor,
	action: AuditAction,
	entityType: AuditEntity,
	entityLabel: string | null
) {
	await db.insert(auditLogs).values({
		tenantId,
		actorId: actor.actorId,
		actorDisplayName: actor.actorDisplayName,
		action,
		entityType,
		entityLabel
	});
}
