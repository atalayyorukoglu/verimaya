import { z } from 'zod';
import { cursorPageSchema } from './common.js';
import { patientSchema } from './patient.js';
import { appointmentSchema } from './appointment.js';
import { transactionSchema } from './transaction.js';
import { inboundMessageSchema, transactionDraftSchema } from './inbound-message.js';
import { patientFileSchema } from './file.js';
import { patientCaseNoteSchema } from './case-note.js';
import { contactSchema, contactTypeSchema } from './contact.js';
import {
	contactDuplicateGroupSchema,
	mergeRecordsSchema,
	patientDuplicateGroupSchema
} from './duplicate.js';
import { financeCategorySchema, appointmentTypeSettingSchema } from './finance-category.js';
import { tenantSchema } from './tenant.js';
import { membershipUserSchema } from './user.js';
import { auditLogSchema } from './audit.js';

/**
 * API contract sketch for /v1 routes.
 * Handlers (MSW now, NestJS later) should conform to these shapes.
 */
export const apiContract = {
	'GET /v1/me': {
		response: membershipUserSchema
	},
	'GET /v1/tenants/current': {
		response: tenantSchema
	},
	'GET /v1/patients': {
		response: cursorPageSchema(patientSchema)
	},
	'GET /v1/patients/:id': {
		response: patientSchema
	},
	'GET /v1/appointments': {
		response: cursorPageSchema(appointmentSchema)
	},
	'GET /v1/appointments/:id': {
		response: appointmentSchema
	},
	'GET /v1/patients/:id/files': {
		response: z.object({ items: z.array(patientFileSchema) })
	},
	'GET /v1/patients/:id/case-notes': {
		response: z.object({ items: z.array(patientCaseNoteSchema) })
	},
	'GET /v1/contacts': {
		response: cursorPageSchema(contactSchema)
	},
	'GET /v1/contacts/:id': {
		response: contactSchema
	},
	'GET /v1/contacts/duplicate-groups': {
		response: z.object({ items: z.array(contactDuplicateGroupSchema) })
	},
	'POST /v1/contacts/merge': {
		body: mergeRecordsSchema,
		response: contactSchema
	},
	'GET /v1/patients/duplicate-groups': {
		response: z.object({ items: z.array(patientDuplicateGroupSchema) })
	},
	'POST /v1/patients/merge': {
		body: mergeRecordsSchema,
		response: patientSchema
	},
	'GET /v1/settings/contact-types': {
		response: z.object({ items: z.array(contactTypeSchema) })
	},
	'GET /v1/appointments/:id/files': {
		response: z.object({ items: z.array(patientFileSchema) })
	},
	'GET /v1/transactions': {
		response: cursorPageSchema(transactionSchema)
	},
	'GET /v1/transactions/:id': {
		response: transactionSchema
	},
	'POST /v1/whatsapp/parse': {
		response: z.object({ records: z.array(transactionDraftSchema) })
	},
	'GET /v1/whatsapp/inbox': {
		response: z.object({ messages: z.array(inboundMessageSchema) })
	},
	'GET /v1/whatsapp/inbox/:id': {
		response: inboundMessageSchema
	},
	'GET /v1/members': {
		response: cursorPageSchema(membershipUserSchema)
	},
	'GET /v1/audit-logs': {
		response: cursorPageSchema(auditLogSchema)
	},
	'GET /v1/settings/finance-categories': {
		response: z.object({ items: z.array(financeCategorySchema) })
	},
	'GET /v1/settings/appointment-types': {
		response: z.object({ items: z.array(appointmentTypeSettingSchema) })
	}
} as const;

export type ApiContract = typeof apiContract;

/** Helper to type a response from the contract map. */
export type ContractResponse<K extends keyof ApiContract> = z.infer<
	ApiContract[K]['response']
>;
