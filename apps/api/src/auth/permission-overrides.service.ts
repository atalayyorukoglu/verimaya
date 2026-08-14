import {
	BadRequestException,
	Injectable
} from '@nestjs/common';
import {
	buildPermissionMatrixFromOverrides,
	hasOrgPermissionDefault,
	isOwnerLockedPermission,
	organizationRolePermissionDefaults,
	orgPermissionActionSchema,
	orgPermissionResourceSchema,
	permissionDenyKey,
	type OrgPermissionAction,
	type OrgPermissionResource,
	type PermissionMatrix,
	type PermissionMatrixPatch,
	type PermissionOverride,
	type PermissionOverrideChange,
	userRoleSchema
} from '@verimaya/shared';
import { and, eq } from 'drizzle-orm';
import { type AuditActor, writeAuditLog } from '../common/audit-helper';
import { tenantPermissionOverrides } from '../db/schema';
import { TenantContextService } from '../tenant/tenant-context.service';
import { overridesToDeniedKeys } from './permissions';

const AUDIT_LABEL_PREFIX = 'permission_override';

@Injectable()
export class PermissionOverridesService {
	constructor(private readonly tenantContext: TenantContextService) {}

	/** Deny-key set for the active tenant — used by OrgPermissionGuard. */
	async getDeniedKeys(tenantId: string): Promise<Set<string>> {
		const overrides = await this.listOverrideRows(tenantId);
		return overridesToDeniedKeys(overrides);
	}

	async getMatrix(tenantId: string): Promise<PermissionMatrix> {
		const overrides = await this.listOverrideRows(tenantId);
		return buildPermissionMatrixFromOverrides(overrides);
	}

	async applyChanges(
		tenantId: string,
		input: PermissionMatrixPatch,
		actor: AuditActor
	): Promise<PermissionMatrix> {
		this.validateChanges(input.changes);

		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const existing = await db
				.select({
					role: tenantPermissionOverrides.role,
					resource: tenantPermissionOverrides.resource,
					action: tenantPermissionOverrides.action
				})
				.from(tenantPermissionOverrides)
				.where(eq(tenantPermissionOverrides.tenantId, tenantId));

			const beforeKeys = new Set(
				existing.map((r) =>
					permissionDenyKey(
						r.role as PermissionOverride['role'],
						r.resource as OrgPermissionResource,
						r.action
					)
				)
			);

			for (const change of input.changes) {
				const key = permissionDenyKey(change.role, change.resource, change.action);
				const beforeAllowed = !beforeKeys.has(key)
					? hasOrgPermissionDefault(change.role, change.resource, change.action)
					: false;

				await db
					.delete(tenantPermissionOverrides)
					.where(
						and(
							eq(tenantPermissionOverrides.tenantId, tenantId),
							eq(tenantPermissionOverrides.role, change.role),
							eq(tenantPermissionOverrides.resource, change.resource),
							eq(tenantPermissionOverrides.action, change.action)
						)
					);

				if (change.allowed === false) {
					await db.insert(tenantPermissionOverrides).values({
						tenantId,
						role: change.role,
						resource: change.resource,
						action: change.action,
						allowed: false
					});
					beforeKeys.add(key);
				} else {
					beforeKeys.delete(key);
				}

				const afterAllowed =
					change.allowed === null
						? hasOrgPermissionDefault(change.role, change.resource, change.action)
						: false;

				await writeAuditLog(
					db,
					tenantId,
					actor,
					'update',
					'tenant',
					`${AUDIT_LABEL_PREFIX}:${change.role}/${change.resource}/${change.action}:${beforeAllowed}->${afterAllowed}`
				);
			}
		});

		return this.getMatrix(tenantId);
	}

	private async listOverrideRows(tenantId: string): Promise<PermissionOverride[]> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db
				.select({
					role: tenantPermissionOverrides.role,
					resource: tenantPermissionOverrides.resource,
					action: tenantPermissionOverrides.action,
					allowed: tenantPermissionOverrides.allowed
				})
				.from(tenantPermissionOverrides)
				.where(eq(tenantPermissionOverrides.tenantId, tenantId));

			const overrides: PermissionOverride[] = [];
			for (const row of rows) {
				const role = userRoleSchema.safeParse(row.role);
				const resource = orgPermissionResourceSchema.safeParse(row.resource);
				const action = orgPermissionActionSchema.safeParse(row.action);
				if (!role.success || !resource.success || !action.success) continue;
				if (row.allowed !== false) continue;
				overrides.push({
					role: role.data,
					resource: resource.data,
					action: action.data,
					allowed: false
				});
			}
			return overrides;
		});
	}

	private validateChanges(changes: PermissionOverrideChange[]): void {
		for (const change of changes) {
			if (isOwnerLockedPermission(change.role, change.resource, change.action)) {
				if (change.allowed === false) {
					throw new BadRequestException({
						error: {
							code: 'owner_permission_locked',
							message:
								'Owner member/settings administration permissions cannot be revoked via override'
						}
					});
				}
			}

			if (change.allowed === false) {
				const defaultActions = organizationRolePermissionDefaults[change.role][
					change.resource
				] as readonly OrgPermissionAction[];
				if (!defaultActions.includes(change.action)) {
					throw new BadRequestException({
						error: {
							code: 'override_escalation_rejected',
							message:
								'Overrides may only restrict permissions granted by the code default'
						}
					});
				}
			}
		}
	}
}
