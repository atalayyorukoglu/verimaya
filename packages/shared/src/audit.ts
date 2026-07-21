import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

export const auditActionSchema = z.enum(['create', 'update', 'delete', 'login']);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditEntitySchema = z.enum([
	'patient',
	'appointment',
	'transaction',
	'inbound_message',
	'file',
	'tenant',
	'user'
]);
export type AuditEntity = z.infer<typeof auditEntitySchema>;

export const auditLogSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	actor_id: uuid.nullable(),
	actor_display_name: z.string().max(255),
	action: auditActionSchema,
	entity_type: auditEntitySchema,
	/** Human-readable target, e.g. patient name or transaction title */
	entity_label: z.string().max(255).nullable(),
	created_at: isoDateTime
});

export type AuditLog = z.infer<typeof auditLogSchema>;
