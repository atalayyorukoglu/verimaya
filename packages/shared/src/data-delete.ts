import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

/**
 * G-25 — tenant operational data delete (preview → plan_token → execute).
 *
 * Not a tenant wipe: org, members, roles, categories, contact/appointment types,
 * and audit_logs are never in scope. Audit of the delete itself is written after
 * the wipe and must outlive it.
 *
 * `DATA_DELETE_PLAN_TTL_MS` (10 min): shorter than import (30 min) — destructive.
 */
export const DATA_DELETE_PLAN_TTL_MS = 10 * 60 * 1000;

export const dataDeleteScopeSchema = z.enum([
	'transactions',
	'appointments',
	'contacts',
	'files'
]);
export type DataDeleteScope = z.infer<typeof dataDeleteScopeSchema>;

/** Ordered delete steps the server may run (includes contact cascade tables). */
export const dataDeleteTableSchema = z.enum([
	'files',
	'appointments',
	'case_notes',
	'contact_data_deletion_requests',
	'transactions',
	'contacts',
	'external_ids'
]);
export type DataDeleteTable = z.infer<typeof dataDeleteTableSchema>;

export const dataDeletePreviewBodySchema = z
	.object({
		scopes: z
			.array(dataDeleteScopeSchema)
			.min(1)
			.max(4)
			.refine((scopes) => new Set(scopes).size === scopes.length, {
				message: 'duplicate_scopes'
			})
	})
	.strict();
export type DataDeletePreviewBody = z.infer<typeof dataDeletePreviewBodySchema>;

export const dataDeleteTableCountSchema = z.object({
	table: dataDeleteTableSchema,
	count: z.number().int().nonnegative()
});
export type DataDeleteTableCount = z.infer<typeof dataDeleteTableCountSchema>;

export const dataDeletePreviewResultSchema = z.object({
	plan_token: z.string().min(1),
	expires_at: isoDateTime,
	organization_name: z.string().min(1).max(255),
	scopes: z.array(dataDeleteScopeSchema).min(1),
	counts: z.array(dataDeleteTableCountSchema),
	total_rows: z.number().int().nonnegative()
});
export type DataDeletePreviewResult = z.infer<typeof dataDeletePreviewResultSchema>;

export const dataDeleteExecuteBodySchema = z
	.object({
		plan_token: z.string().min(1).max(2_000_000),
		/** Must match `tenants.name` exactly (after trim) — wrong-tenant safeguard. */
		confirm_organization_name: z.string().min(1).max(255)
	})
	.strict();
export type DataDeleteExecuteBody = z.infer<typeof dataDeleteExecuteBodySchema>;

export const dataDeleteExecuteResultSchema = z.object({
	scopes: z.array(dataDeleteScopeSchema).min(1),
	deleted: z.array(dataDeleteTableCountSchema),
	total_deleted: z.number().int().nonnegative()
});
export type DataDeleteExecuteResult = z.infer<typeof dataDeleteExecuteResultSchema>;

/**
 * Encrypted plan payload (CryptoService + base64url), same pattern as import
 * `plan_token`. `jti` is single-use (claimed in the execute transaction).
 */
export const dataDeletePlanSchema = z.object({
	v: z.literal(1),
	kind: z.literal('data_delete'),
	tenant_id: uuid,
	jti: uuid,
	exp: z.number().int().positive(),
	scopes: z.array(dataDeleteScopeSchema).min(1).max(4),
	/** Deterministic delete order for this plan. */
	tables: z.array(dataDeleteTableSchema).min(1)
});
export type DataDeletePlan = z.infer<typeof dataDeletePlanSchema>;

/**
 * Expand user-selected scopes into concrete tables.
 * Selecting `contacts` always pulls appointments, files, case_notes, and
 * contact_data_deletion_requests (FK / cascade honesty in the preview).
 */
export function expandDataDeleteTables(scopes: readonly DataDeleteScope[]): DataDeleteTable[] {
	const selected = new Set(scopes);
	const tables: DataDeleteTable[] = [];

	const needFiles = selected.has('files') || selected.has('contacts');
	const needAppointments = selected.has('appointments') || selected.has('contacts');
	const needContacts = selected.has('contacts');
	const needTransactions = selected.has('transactions');

	if (needFiles) tables.push('files');
	if (needAppointments) tables.push('appointments');
	if (needContacts) {
		tables.push('case_notes');
		tables.push('contact_data_deletion_requests');
	}
	if (needTransactions) tables.push('transactions');
	if (needContacts) tables.push('contacts');

	const needExternalIds =
		needFiles || needAppointments || needTransactions || needContacts;
	if (needExternalIds) tables.push('external_ids');

	return tables;
}
