import {
	BadRequestException,
	ForbiddenException,
	Injectable
} from '@nestjs/common';
import { and, count, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
	DATA_DELETE_PLAN_TTL_MS,
	dataDeletePlanSchema,
	expandDataDeleteTables,
	type DataDeleteExecuteBody,
	type DataDeleteExecuteResult,
	type DataDeletePlan,
	type DataDeletePreviewBody,
	type DataDeletePreviewResult,
	type DataDeleteScope,
	type DataDeleteTable,
	type DataDeleteTableCount,
	type UserRole
} from '@verimaya/shared';
import { type AuditActor, writeAuditLog } from '../common/audit-helper';
import { CryptoService } from '../common/crypto.service';
import { isUniqueViolation } from '../common/postgres-errors';
import {
	appointments,
	auditLogs,
	caseNotes,
	contactDataDeletionRequests,
	contacts,
	externalIds,
	files,
	idempotencyKeys,
	tenants,
	transactions
} from '../db/schema';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

/** Entity types whose external_ids rows are cleared with the matching scope. */
const EXTERNAL_ID_ENTITY_BY_TABLE: Partial<Record<DataDeleteTable, string>> = {
	files: 'file',
	appointments: 'appointment',
	transactions: 'transaction',
	contacts: 'contact'
};

@Injectable()
export class DataDeleteService {
	/**
	 * Test-only: when set, `deleteTableRows` throws after this many successful
	 * table deletes so the surrounding tenant transaction rolls back.
	 */
	failAfterSuccessfulTables: number | null = null;

	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly crypto: CryptoService
	) {}

	/** Hard gate — not an OrgPermission; G-11 overrides cannot grant this. */
	assertOwnerRole(role: UserRole): void {
		if (role !== 'owner') {
			throw new ForbiddenException({
				error: {
					code: 'owner_required',
					message: 'Only the organization owner can delete operational data'
				}
			});
		}
	}

	async preview(
		tenantId: string,
		role: UserRole,
		input: DataDeletePreviewBody
	): Promise<DataDeletePreviewResult> {
		this.assertOwnerRole(role);
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const orgName = await this.requireOrgName(db, tenantId);
			const scopes = input.scopes as DataDeleteScope[];
			const tables = expandDataDeleteTables(scopes);
			const counts = await this.countTables(db, tenantId, tables);
			const total_rows = counts.reduce((sum, row) => sum + row.count, 0);

			const exp = Date.now() + DATA_DELETE_PLAN_TTL_MS;
			const plan: DataDeletePlan = {
				v: 1,
				kind: 'data_delete',
				tenant_id: tenantId,
				jti: randomUUID(),
				exp,
				scopes,
				tables
			};
			const plan_token = this.crypto.encrypt(JSON.stringify(plan)).toString('base64url');

			return {
				plan_token,
				expires_at: new Date(exp).toISOString(),
				organization_name: orgName,
				scopes,
				counts,
				total_rows
			};
		});
	}

	async execute(
		tenantId: string,
		role: UserRole,
		input: DataDeleteExecuteBody,
		actor: AuditActor
	): Promise<DataDeleteExecuteResult> {
		this.assertOwnerRole(role);
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const plan = this.decryptPlan(tenantId, input.plan_token);
			const orgName = await this.requireOrgName(db, tenantId);
			if (orgName.trim() !== input.confirm_organization_name.trim()) {
				throw new BadRequestException({
					error: {
						code: 'confirm_organization_name_mismatch',
						message: 'Organization name confirmation does not match'
					}
				});
			}

			await this.claimPlanJti(db, tenantId, plan.jti);

			const deleted: DataDeleteTableCount[] = [];
			let successful = 0;
			for (const table of plan.tables) {
				const n = await this.deleteTableRows(db, tenantId, table, plan.tables);
				deleted.push({ table, count: n });
				successful += 1;
				if (
					this.failAfterSuccessfulTables != null &&
					successful >= this.failAfterSuccessfulTables
				) {
					throw new Error('data_delete_injected_failure');
				}
			}

			const total_deleted = deleted.reduce((sum, row) => sum + row.count, 0);
			const scopeLabel = plan.scopes.join('+');
			await writeAuditLog(
				db,
				tenantId,
				actor,
				'delete',
				'tenant',
				`data_delete scopes=${scopeLabel} total=${total_deleted}`
			);

			return {
				scopes: plan.scopes,
				deleted,
				total_deleted
			};
		});
	}

	private async requireOrgName(db: TenantDb, tenantId: string): Promise<string> {
		const [row] = await db
			.select({ name: tenants.name })
			.from(tenants)
			.where(eq(tenants.id, tenantId))
			.limit(1);
		if (!row) {
			throw new BadRequestException({
				error: { code: 'tenant_not_found', message: 'Tenant not found' }
			});
		}
		return row.name;
	}

	private decryptPlan(tenantId: string, planToken: string): DataDeletePlan {
		if (!planToken.trim()) {
			throw new BadRequestException({
				error: { code: 'invalid_plan_token', message: 'Data delete plan token is required' }
			});
		}
		let json: string;
		try {
			json = this.crypto.decrypt(Buffer.from(planToken, 'base64url'));
		} catch {
			throw new BadRequestException({
				error: { code: 'invalid_plan_token', message: 'Data delete plan token is invalid' }
			});
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(json);
		} catch {
			throw new BadRequestException({
				error: { code: 'invalid_plan_token', message: 'Data delete plan token is corrupt' }
			});
		}
		const plan = dataDeletePlanSchema.safeParse(parsed);
		if (!plan.success) {
			throw new BadRequestException({
				error: {
					code: 'invalid_plan_token',
					message: 'Data delete plan schema mismatch'
				}
			});
		}
		if (plan.data.tenant_id !== tenantId) {
			throw new BadRequestException({
				error: {
					code: 'invalid_plan_token',
					message: 'Data delete plan tenant mismatch'
				}
			});
		}
		if (plan.data.exp < Date.now()) {
			throw new BadRequestException({
				error: {
					code: 'plan_expired',
					message: 'Data delete plan expired — run preview again'
				}
			});
		}
		return plan.data;
	}

	/**
	 * Single-use claim inside the same tenant transaction as the deletes.
	 * Unique violation → plan already executed; rollback on later failure
	 * releases the claim so a fresh preview can be used.
	 */
	private async claimPlanJti(db: TenantDb, tenantId: string, jti: string): Promise<void> {
		try {
			await db.insert(idempotencyKeys).values({
				tenantId,
				key: `data-delete-plan:${jti}`,
				method: 'POST',
				normalizedPath: '/v1/settings/data-delete/execute',
				statusCode: 200,
				responseBody: { claimed: true }
			});
		} catch (err: unknown) {
			if (isUniqueViolation(err)) {
				throw new BadRequestException({
					error: {
						code: 'plan_already_used',
						message: 'Data delete plan token was already used'
					}
				});
			}
			throw err;
		}
	}

	private async countTables(
		db: TenantDb,
		tenantId: string,
		tables: readonly DataDeleteTable[]
	): Promise<DataDeleteTableCount[]> {
		const out: DataDeleteTableCount[] = [];
		for (const table of tables) {
			out.push({
				table,
				count: await this.countTableRows(db, tenantId, table, tables)
			});
		}
		return out;
	}

	private async countTableRows(
		db: TenantDb,
		tenantId: string,
		table: DataDeleteTable,
		planTables: readonly DataDeleteTable[]
	): Promise<number> {
		if (table === 'external_ids') {
			const entityTypes = this.externalIdEntityTypes(planTables);
			if (entityTypes.length === 0) return 0;
			const [row] = await db
				.select({ n: count() })
				.from(externalIds)
				.where(
					and(
						eq(externalIds.tenantId, tenantId),
						inArray(externalIds.entityType, entityTypes)
					)
				);
			return Number(row?.n ?? 0);
		}

		const source = this.tableSource(table);
		const [row] = await db
			.select({ n: count() })
			.from(source)
			.where(eq(source.tenantId, tenantId));
		return Number(row?.n ?? 0);
	}

	async deleteTableRows(
		db: TenantDb,
		tenantId: string,
		table: DataDeleteTable,
		planTables: readonly DataDeleteTable[]
	): Promise<number> {
		if (table === 'external_ids') {
			const entityTypes = this.externalIdEntityTypes(planTables);
			if (entityTypes.length === 0) return 0;
			const removed = await db
				.delete(externalIds)
				.where(
					and(
						eq(externalIds.tenantId, tenantId),
						inArray(externalIds.entityType, entityTypes)
					)
				)
				.returning({ id: externalIds.id });
			return removed.length;
		}

		const source = this.tableSource(table);
		const removed = await db
			.delete(source)
			.where(eq(source.tenantId, tenantId))
			.returning({ id: source.id });
		return removed.length;
	}

	private externalIdEntityTypes(planTables: readonly DataDeleteTable[]): string[] {
		const types: string[] = [];
		for (const table of planTables) {
			const entity = EXTERNAL_ID_ENTITY_BY_TABLE[table];
			if (entity) types.push(entity);
		}
		return types;
	}

	private tableSource(table: Exclude<DataDeleteTable, 'external_ids'>) {
		switch (table) {
			case 'files':
				return files;
			case 'appointments':
				return appointments;
			case 'case_notes':
				return caseNotes;
			case 'contact_data_deletion_requests':
				return contactDataDeletionRequests;
			case 'transactions':
				return transactions;
			case 'contacts':
				return contacts;
			default: {
				const _exhaustive: never = table;
				throw new Error(`Unknown data-delete table: ${_exhaustive}`);
			}
		}
	}
}

/** Exported for isolation specs that need to count audit rows after execute. */
export async function countAuditLogsForTenant(db: TenantDb, tenantId: string): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(auditLogs)
		.where(eq(auditLogs.tenantId, tenantId));
	return Number(row?.n ?? 0);
}
