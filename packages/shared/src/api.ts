import { z } from 'zod';
import { cursorPageSchema } from './common.js';

/** REST prefix for all Verimaya API routes. */
export const API_V1_PREFIX = '/v1';

/** Canonical /v1 path constants — MSW handlers and NestJS should match these. */
export const apiPaths = {
	me: `${API_V1_PREFIX}/me`,
	tenantsCurrent: `${API_V1_PREFIX}/tenants/current`,
	patients: `${API_V1_PREFIX}/patients`,
	patient: (id: string) => `${API_V1_PREFIX}/patients/${id}`,
	patientFinanceSummary: (id: string) => `${API_V1_PREFIX}/patients/${id}/finance-summary`,
	patientsDuplicateGroups: `${API_V1_PREFIX}/patients/duplicate-groups`,
	patientsMerge: `${API_V1_PREFIX}/patients/merge`,
	appointments: `${API_V1_PREFIX}/appointments`,
	appointment: (id: string) => `${API_V1_PREFIX}/appointments/${id}`,
	contacts: `${API_V1_PREFIX}/contacts`,
	contact: (id: string) => `${API_V1_PREFIX}/contacts/${id}`,
	contactsDuplicateGroups: `${API_V1_PREFIX}/contacts/duplicate-groups`,
	contactsMerge: `${API_V1_PREFIX}/contacts/merge`,
	transactions: `${API_V1_PREFIX}/transactions`,
	transaction: (id: string) => `${API_V1_PREFIX}/transactions/${id}`,
	auditLogs: `${API_V1_PREFIX}/audit-logs`,
	settingsFinanceCategories: `${API_V1_PREFIX}/settings/finance-categories`,
	settingsFinanceCategory: (id: string) => `${API_V1_PREFIX}/settings/finance-categories/${id}`,
	settingsContactTypes: `${API_V1_PREFIX}/settings/contact-types`,
	settingsContactType: (id: string) => `${API_V1_PREFIX}/settings/contact-types/${id}`,
	settingsAppointmentTypes: `${API_V1_PREFIX}/settings/appointment-types`,
	settingsCredential: (provider: string) => `${API_V1_PREFIX}/settings/credentials/${provider}`,
	settingsAppointmentType: (id: string) => `${API_V1_PREFIX}/settings/appointment-types/${id}`,
	whatsappInbox: `${API_V1_PREFIX}/whatsapp/inbox`,
	adMetrics: `${API_V1_PREFIX}/ad-metrics`,
	apiKeys: `${API_V1_PREFIX}/api-keys`,
	apiKey: (id: string) => `${API_V1_PREFIX}/api-keys/${id}`,
	reportsSummary: `${API_V1_PREFIX}/reports/summary`,
	reportsByCategory: `${API_V1_PREFIX}/reports/by-category`
} as const;

export type ListQueryParams = {
	cursor?: string | null;
	limit?: number;
	q?: string;
	from?: string;
	to?: string;
	patient_id?: string | null;
	contact_id?: string | null;
	type_id?: string | null;
};

/** Build a cursor-paginated list URL (path + query only, no origin). */
export function listUrl(resource: string, params?: ListQueryParams): string {
	const url = new URL(`${API_V1_PREFIX}/${resource}`, 'http://local');
	if (params?.cursor) url.searchParams.set('cursor', params.cursor);
	if (params?.limit) url.searchParams.set('limit', String(params.limit));
	if (params?.q) url.searchParams.set('q', params.q);
	if (params?.from) url.searchParams.set('from', params.from);
	if (params?.to) url.searchParams.set('to', params.to);
	if (params?.patient_id) url.searchParams.set('patient_id', params.patient_id);
	if (params?.contact_id) url.searchParams.set('contact_id', params.contact_id);
	if (params?.type_id) url.searchParams.set('type_id', params.type_id);
	return `${url.pathname}${url.search}`;
}
import { patientSchema, patientFinanceSummarySchema } from './patient.js';
import { appointmentSchema } from './appointment.js';
import { transactionSchema } from './transaction.js';
import { inboundMessageSchema, transactionDraftSchema } from './inbound-message.js';
import { patientFileCreateSchema, patientFileSchema } from './file.js';
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
import { adMetricSchema } from './ad-metrics.js';
import { apiKeyCreateSchema, apiKeyCreatedSchema, apiKeySchema } from './api-key.js';
import { reportByCategorySchema, reportSummarySchema } from './reports.js';
import { credentialStatusSchema, credentialUpsertSchema } from './credentials.js';

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
	'GET /v1/patients/:id/finance-summary': {
		response: patientFinanceSummarySchema
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
	'POST /v1/patients/:id/files': {
		body: patientFileCreateSchema,
		response: patientFileSchema
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
		response: z.object({
			messages: z.array(inboundMessageSchema),
			next_cursor: z.string().nullable()
		})
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
	},
	'GET /v1/settings/credentials/:provider': {
		response: credentialStatusSchema
	},
	'PUT /v1/settings/credentials/:provider': {
		body: credentialUpsertSchema,
		response: credentialStatusSchema
	},
	'GET /v1/ad-metrics': {
		response: z.object({ items: z.array(adMetricSchema) })
	},
	'GET /v1/api-keys': {
		response: z.object({ items: z.array(apiKeySchema) })
	},
	'POST /v1/api-keys': {
		body: apiKeyCreateSchema,
		response: apiKeyCreatedSchema
	},
	'DELETE /v1/api-keys/:id': {
		response: apiKeySchema
	},
	'GET /v1/reports/summary': {
		response: reportSummarySchema
	},
	'GET /v1/reports/by-category': {
		response: reportByCategorySchema
	}
} as const;

export type ApiContract = typeof apiContract;

/** Helper to type a response from the contract map. */
export type ContractResponse<K extends keyof ApiContract> = z.infer<
	ApiContract[K]['response']
>;
