import { z } from 'zod';
import { cursorPageSchema, softDeleteResultSchema } from './common.js';
import {
	knowledgeRevisionListSchema,
	knowledgeSettingsSchema,
	knowledgeUpdateSchema
} from './knowledge.js';
import { mayaAnswerSchema, mayaAskSchema } from './maya.js';

/** REST prefix for all Verimaya API routes. */
export const API_V1_PREFIX = '/v1';

/** Canonical /v1 path constants — MSW handlers and NestJS should match these. */
export const apiPaths = {
	me: `${API_V1_PREFIX}/me`,
	meOrganizations: `${API_V1_PREFIX}/me/organizations`,
	mePreferences: `${API_V1_PREFIX}/me/preferences`,
	meDataExport: `${API_V1_PREFIX}/me/data-export`,
	meDataDeletionRequest: `${API_V1_PREFIX}/me/data-deletion-request`,
	tenantsCurrent: `${API_V1_PREFIX}/tenants/current`,
	platformTenants: `${API_V1_PREFIX}/platform/tenants`,
	platformTenant: (id: string) => `${API_V1_PREFIX}/platform/tenants/${id}`,
	platformTenantMembers: (id: string) => `${API_V1_PREFIX}/platform/tenants/${id}/members`,
	platformTenantMember: (tenantId: string, userId: string) =>
		`${API_V1_PREFIX}/platform/tenants/${tenantId}/members/${userId}`,
	members: `${API_V1_PREFIX}/members`,
	member: (id: string) => `${API_V1_PREFIX}/members/${id}`,
	memberPasswordReset: (id: string) => `${API_V1_PREFIX}/members/${id}/password-reset`,
	appointments: `${API_V1_PREFIX}/appointments`,
	appointment: (id: string) => `${API_V1_PREFIX}/appointments/${id}`,
	operationAlerts: `${API_V1_PREFIX}/operation-alerts`,
	operationAlert: (id: string) => `${API_V1_PREFIX}/operation-alerts/${id}`,
	operationAlertConfirm: (id: string) => `${API_V1_PREFIX}/operation-alerts/${id}/confirm`,
	recordSuggestions: `${API_V1_PREFIX}/record-suggestions`,
	recordSuggestionsParse: `${API_V1_PREFIX}/record-suggestions/parse`,
	recordSuggestionApprove: (id: string) => `${API_V1_PREFIX}/record-suggestions/${id}/approve`,
	recordSuggestionReject: (id: string) => `${API_V1_PREFIX}/record-suggestions/${id}/reject`,
	contacts: `${API_V1_PREFIX}/contacts`,
	contact: (id: string) => `${API_V1_PREFIX}/contacts/${id}`,
	contactFinanceSummary: (id: string) => `${API_V1_PREFIX}/contacts/${id}/finance-summary`,
	contactDataExport: (id: string) => `${API_V1_PREFIX}/contacts/${id}/data-export`,
	contactDataDeletionRequest: (id: string) =>
		`${API_V1_PREFIX}/contacts/${id}/data-deletion-request`,
	contactAutoLinkTransactions: (id: string) =>
		`${API_V1_PREFIX}/contacts/${id}/auto-link-transactions`,
	contactFiles: (id: string) => `${API_V1_PREFIX}/contacts/${id}/files`,
	contactFilesPresign: (id: string) => `${API_V1_PREFIX}/contacts/${id}/files/presign`,
	contactFile: (contactId: string, fileId: string) =>
		`${API_V1_PREFIX}/contacts/${contactId}/files/${fileId}`,
	contactFileConfirm: (contactId: string, fileId: string) =>
		`${API_V1_PREFIX}/contacts/${contactId}/files/${fileId}/confirm`,
	contactFileContent: (contactId: string, fileId: string) =>
		`${API_V1_PREFIX}/contacts/${contactId}/files/${fileId}/content`,
	contactFileDownload: (contactId: string, fileId: string) =>
		`${API_V1_PREFIX}/contacts/${contactId}/files/${fileId}/download`,
	contactFilePreview: (contactId: string, fileId: string) =>
		`${API_V1_PREFIX}/contacts/${contactId}/files/${fileId}/preview`,
	contactCaseNotes: (id: string) => `${API_V1_PREFIX}/contacts/${id}/case-notes`,
	contactsBulkType: `${API_V1_PREFIX}/contacts/bulk-type`,
	contactsDuplicateGroups: `${API_V1_PREFIX}/contacts/duplicate-groups`,
	contactsMerge: `${API_V1_PREFIX}/contacts/merge`,
	transactions: `${API_V1_PREFIX}/transactions`,
	transaction: (id: string) => `${API_V1_PREFIX}/transactions/${id}`,
	transactionsAuditDraft: `${API_V1_PREFIX}/transactions/audit-draft`,
	incentives: `${API_V1_PREFIX}/incentives`,
	incentive: (id: string) => `${API_V1_PREFIX}/incentives/${id}`,
	commissions: `${API_V1_PREFIX}/commissions`,
	commission: (id: string) => `${API_V1_PREFIX}/commissions/${id}`,
	fxRate: (params: { from: string; to: string; on: string }) => {
		const url = new URL(`${API_V1_PREFIX}/fx/rate`, 'http://local');
		url.searchParams.set('from', params.from);
		url.searchParams.set('to', params.to);
		url.searchParams.set('on', params.on);
		return `${url.pathname}${url.search}`;
	},
	auditLogs: `${API_V1_PREFIX}/audit-logs`,
	settingsFinanceCategories: `${API_V1_PREFIX}/settings/finance-categories`,
	settingsFinanceCategoriesReorder: `${API_V1_PREFIX}/settings/finance-categories/reorder`,
	settingsFinanceCategory: (id: string) => `${API_V1_PREFIX}/settings/finance-categories/${id}`,
	settingsContactTypes: `${API_V1_PREFIX}/settings/contact-types`,
	settingsContactTypesReorder: `${API_V1_PREFIX}/settings/contact-types/reorder`,
	settingsContactType: (id: string) => `${API_V1_PREFIX}/settings/contact-types/${id}`,
	settingsOrganizations: `${API_V1_PREFIX}/settings/organizations`,
	settingsOrganization: (id: string) => `${API_V1_PREFIX}/settings/organizations/${id}`,
	settingsAppointmentTypes: `${API_V1_PREFIX}/settings/appointment-types`,
	settingsAppointmentTypesReorder: `${API_V1_PREFIX}/settings/appointment-types/reorder`,
	settingsCredential: (provider: string) => `${API_V1_PREFIX}/settings/credentials/${provider}`,
	settingsAppointmentType: (id: string) => `${API_V1_PREFIX}/settings/appointment-types/${id}`,
	settingsAiDisclosure: `${API_V1_PREFIX}/settings/ai-disclosure`,
	settingsAiPrompt: `${API_V1_PREFIX}/settings/ai-prompt`,
	settingsKnowledge: `${API_V1_PREFIX}/settings/knowledge`,
	settingsKnowledgeRevisions: `${API_V1_PREFIX}/settings/knowledge/revisions`,
	settingsOperationAlerts: `${API_V1_PREFIX}/settings/operation-alerts`,
	mayaAsk: `${API_V1_PREFIX}/maya/ask`,
	settingsIncentiveDeadline: `${API_V1_PREFIX}/settings/incentive-deadline`,
	settingsPermissions: `${API_V1_PREFIX}/settings/permissions`,
	settingsImportContactsTemplate: `${API_V1_PREFIX}/settings/import-export/contacts/template.xlsx`,
	settingsImportContactsExport: `${API_V1_PREFIX}/settings/import-export/contacts/export.xlsx`,
	settingsImportContactsDryRun: `${API_V1_PREFIX}/settings/import-export/contacts/import/dry-run`,
	settingsImportContactsCommit: `${API_V1_PREFIX}/settings/import-export/contacts/import/commit`,
	settingsImportBundleTemplate: `${API_V1_PREFIX}/settings/import-export/bundle/template.xlsx`,
	settingsImportBundleExport: `${API_V1_PREFIX}/settings/import-export/bundle/export.xlsx`,
	settingsImportBundleDryRun: `${API_V1_PREFIX}/settings/import-export/bundle/import/dry-run`,
	settingsImportBundleCommit: `${API_V1_PREFIX}/settings/import-export/bundle/import/commit`,
	settingsDataDeletePreview: `${API_V1_PREFIX}/settings/data-delete/preview`,
	settingsDataDeleteExecute: `${API_V1_PREFIX}/settings/data-delete/execute`,
	integrationsGhlStatus: `${API_V1_PREFIX}/integrations/ghl/status`,
	integrationsGhlAuthorize: `${API_V1_PREFIX}/integrations/ghl/authorize`,
	// Neutral path — GHL Marketplace rejects redirect URIs containing "ghl"/Highlevel.
	integrationsGhlCallback: `${API_V1_PREFIX}/integrations/crm/callback`,
	integrationsGhlReconcile: `${API_V1_PREFIX}/integrations/ghl/reconcile`,
	integrationsGhl: `${API_V1_PREFIX}/integrations/ghl`,
	integrationsAdsStatus: `${API_V1_PREFIX}/integrations/ads/status`,
	integrationsAdsGoogleCustomerId: `${API_V1_PREFIX}/integrations/ads/google/customer-id`,
	scorecardProfile: `${API_V1_PREFIX}/scorecard/profile`,
	scorecardCurrent: `${API_V1_PREFIX}/scorecard/current`,
	scorecardAssessments: `${API_V1_PREFIX}/scorecard/assessments`,
	scorecardAssessment: (id: string) => `${API_V1_PREFIX}/scorecard/assessments/${id}`,
	scorecardCompare: (previous: string, current: string) =>
		`${API_V1_PREFIX}/scorecard/compare?previous=${encodeURIComponent(previous)}&current=${encodeURIComponent(current)}`,
	scorecardAssessmentComplete: (id: string) =>
		`${API_V1_PREFIX}/scorecard/assessments/${id}/complete`,
	scorecardAssessmentAnswers: (id: string) =>
		`${API_V1_PREFIX}/scorecard/assessments/${id}/answers`,
	scorecardBaseline: `${API_V1_PREFIX}/scorecard/baseline`,
	scorecardAutoFill: `${API_V1_PREFIX}/scorecard/auto-fill`,
	scorecardAssessmentAutoFill: (id: string) =>
		`${API_V1_PREFIX}/scorecard/assessments/${id}/auto-fill`,
	whatsappParse: `${API_V1_PREFIX}/whatsapp/parse`,
	whatsappInbox: `${API_V1_PREFIX}/whatsapp/inbox`,
	whatsappInboxItem: (id: string) => `${API_V1_PREFIX}/whatsapp/inbox/${id}`,
	whatsappInboxProcess: `${API_V1_PREFIX}/whatsapp/inbox/process`,
	whatsappInboxParse: (id: string) => `${API_V1_PREFIX}/whatsapp/inbox/${id}/parse`,
	whatsappInboxApprove: (id: string) => `${API_V1_PREFIX}/whatsapp/inbox/${id}/approve`,
	whatsappInboxApproveDrafts: (id: string) =>
		`${API_V1_PREFIX}/whatsapp/inbox/${id}/approve-drafts`,
	whatsappInboxIgnore: (id: string) => `${API_V1_PREFIX}/whatsapp/inbox/${id}/ignore`,
	whatsappCorrections: `${API_V1_PREFIX}/whatsapp/corrections`,
	whatsappCorrectionsList: (params?: { cursor?: string | null; limit?: number }) => {
		const url = new URL(`${API_V1_PREFIX}/whatsapp/corrections`, 'http://local');
		if (params?.cursor) url.searchParams.set('cursor', params.cursor);
		if (params?.limit) url.searchParams.set('limit', String(params.limit));
		return `${url.pathname}${url.search}`;
	},
	whatsappCorrectionsReport: `${API_V1_PREFIX}/whatsapp/corrections-report`,
	whatsappCorrectionsReportQuery: (params?: { from?: string; to?: string }) => {
		const url = new URL(`${API_V1_PREFIX}/whatsapp/corrections-report`, 'http://local');
		if (params?.from) url.searchParams.set('from', params.from);
		if (params?.to) url.searchParams.set('to', params.to);
		return `${url.pathname}${url.search}`;
	},
	/** GAP-F09-16: inline create from draft approval (no create-subcategory — flat categories). */
	whatsappCreateContact: `${API_V1_PREFIX}/whatsapp/create-contact`,
	whatsappCreateCategory: `${API_V1_PREFIX}/whatsapp/create-category`,
	adMetrics: `${API_V1_PREFIX}/ad-metrics`,
	adMetricsSync: `${API_V1_PREFIX}/ad-metrics/sync`,
	apiKeys: `${API_V1_PREFIX}/api-keys`,
	apiKey: (id: string) => `${API_V1_PREFIX}/api-keys/${id}`,
	webhookSubscriptions: `${API_V1_PREFIX}/webhook-subscriptions`,
	webhookSubscription: (id: string) => `${API_V1_PREFIX}/webhook-subscriptions/${id}`,
	reportsSummary: `${API_V1_PREFIX}/reports/summary`,
	reportsByCategory: `${API_V1_PREFIX}/reports/by-category`,
	reportsByCategoryDetail: `${API_V1_PREFIX}/reports/by-category-detail`,
	reportsByResponsible: `${API_V1_PREFIX}/reports/by-responsible`,
	reportsMonthly: `${API_V1_PREFIX}/reports/monthly`,
	reportsContactDistribution: `${API_V1_PREFIX}/reports/contact-distribution`,
	reportsBalances: `${API_V1_PREFIX}/reports/balances`,
	reportsCommissionSummary: `${API_V1_PREFIX}/reports/commission-summary`,
	reportsAppointmentMetrics: `${API_V1_PREFIX}/reports/appointment-metrics`,
	reportsConsistency: `${API_V1_PREFIX}/reports/consistency`,
	reportsTransactionDuplicates: `${API_V1_PREFIX}/reports/transaction-duplicates`,
	reportsUntouchedContacts: `${API_V1_PREFIX}/reports/untouched-contacts`,
	reportsCohorts: `${API_V1_PREFIX}/reports/cohorts`
} as const;

export type ListQueryParams = {
	cursor?: string | null;
	limit?: number;
	q?: string;
	from?: string;
	to?: string;
	contact_id?: string | null;
	/** G-05r: appointment role-agnostic contact filter */
	contact_involves?: string | null;
	case_contact_id?: string | null;
	/** Commission entries: filter by beneficiary (clinic / referrer / sub-agency). */
	beneficiary_contact_id?: string | null;
	type_id?: string | null;
	kind?: string;
	status?: string;
	category?: string;
	/** Incentive files: keep rows with deadline within N calendar days (incl. overdue). */
	due_within_days?: number;
	/** Operation alerts: keep rows with due_at within N hours (incl. overdue). */
	within_hours?: number;
	/** GAP-F09-13: audit-logs list filters */
	actor_id?: string;
	action?: string;
	entity_type?: string;
	created_from?: string;
	created_to?: string;
};

/** Build a cursor-paginated list URL (path + query only, no origin). */
export function listUrl(resource: string, params?: ListQueryParams): string {
	const url = new URL(`${API_V1_PREFIX}/${resource}`, 'http://local');
	if (params?.cursor) url.searchParams.set('cursor', params.cursor);
	if (params?.limit) url.searchParams.set('limit', String(params.limit));
	if (params?.q) url.searchParams.set('q', params.q);
	if (params?.from) url.searchParams.set('from', params.from);
	if (params?.to) url.searchParams.set('to', params.to);
	if (params?.contact_id) url.searchParams.set('contact_id', params.contact_id);
	if (params?.contact_involves) url.searchParams.set('contact_involves', params.contact_involves);
	if (params?.case_contact_id) url.searchParams.set('case_contact_id', params.case_contact_id);
	if (params?.beneficiary_contact_id) {
		url.searchParams.set('beneficiary_contact_id', params.beneficiary_contact_id);
	}
	if (params?.type_id) url.searchParams.set('type_id', params.type_id);
	if (params?.kind) url.searchParams.set('kind', params.kind);
	if (params?.status) url.searchParams.set('status', params.status);
	if (params?.category) url.searchParams.set('category', params.category);
	if (params?.due_within_days != null) {
		url.searchParams.set('due_within_days', String(params.due_within_days));
	}
	if (params?.within_hours != null) {
		url.searchParams.set('within_hours', String(params.within_hours));
	}
	if (params?.actor_id) url.searchParams.set('actor_id', params.actor_id);
	if (params?.action) url.searchParams.set('action', params.action);
	if (params?.entity_type) url.searchParams.set('entity_type', params.entity_type);
	if (params?.created_from) url.searchParams.set('created_from', params.created_from);
	if (params?.created_to) url.searchParams.set('created_to', params.created_to);
	return `${url.pathname}${url.search}`;
}
import {
	contactSchema,
	contactFinanceSummarySchema,
	contactAutoLinkTransactionsResultSchema,
	contactsBulkTypeResultSchema,
	contactsBulkTypeSchema,
	contactTypeSchema,
	contactTypeUpdateSchema,
	organizationSchema,
	organizationUpdateSchema
} from './contact.js';
import { appointmentListPageSchema, appointmentSchema } from './appointment.js';
import {
	operationAlertCreateSchema,
	operationAlertListPageSchema,
	operationAlertSchema,
	operationAlertSettingsSchema,
	operationAlertSettingsUpdateSchema
} from './operation-alert.js';
import {
	recordUpdateSuggestionListPageSchema,
	recordUpdateSuggestionParseRequestSchema,
	recordUpdateSuggestionParseResponseSchema,
	recordUpdateSuggestionRejectRequestSchema,
	recordUpdateSuggestionSchema
} from './record-update-suggestion.js';
import {
	incentiveFileCreateSchema,
	incentiveFileListPageSchema,
	incentiveFileSchema,
	incentiveFileUpdateSchema
} from './incentive-file.js';
import {
	commissionEntryCreateSchema,
	commissionEntryListPageSchema,
	commissionEntrySchema,
	commissionEntryUpdateSchema,
	commissionSummarySchema
} from './commission.js';
import {
	incentiveDeadlineSettingsSchema,
	incentiveDeadlineSettingsUpdateSchema
} from './incentive-settings.js';
import { transactionSchema } from './transaction.js';
import {
	transactionAuditDraftResponseSchema,
	transactionAuditDraftSchema
} from './transaction-consistency.js';
import { fxRateQuerySchema, fxRateResponseSchema } from './fx.js';
import {
	approveDraftsRequestSchema,
	approveDraftsResponseSchema,
	inboundMessageActionResponseSchema,
	whatsappCreateCategorySchema,
	whatsappCreateContactSchema,
	inboundMessageProcessResponseSchema,
	inboundMessageSchema,
	transactionDraftSchema
} from './inbound-message.js';
import { contactFileCreateSchema, contactFileSchema } from './file.js';
import { contactCaseNoteCreateSchema, contactCaseNoteSchema } from './case-note.js';
import {
	contactDuplicateGroupsResponseSchema,
	mergeRecordsSchema
} from './duplicate.js';
import {
	financeCategorySchema,
	appointmentTypeSettingSchema
} from './finance-category.js';
import { settingsReorderResultSchema, settingsReorderSchema } from './settings-reorder.js';
import { tenantSchema } from './tenant.js';
import {
	membershipUserSchema,
	memberCreateSchema,
	memberPasswordResetResultSchema,
	memberUpdateSchema
} from './user.js';
import {
	meOrganizationListSchema,
	meSchema,
	platformMemberListSchema,
	platformMemberUpsertSchema,
	platformSoftDeleteResultSchema,
	platformTenantCreateSchema,
	platformTenantListSchema,
	platformTenantSchema,
	platformTenantUpdateSchema
} from './platform.js';
import {
	userUiPreferencesSchema,
	userUiPreferencesUpdateSchema
} from './product-modules.js';
import { auditLogSchema } from './audit.js';
import { dataDeletionRequestSchema, dataExportSchema } from './data-subject.js';
import {
	contactDataDeletionRequestSchema,
	contactDataExportSchema
} from './contact-data-subject.js';
import { adMetricSchema, adMetricsSyncResultSchema } from './ad-metrics.js';
import { apiKeyCreateSchema, apiKeyCreatedSchema, apiKeySchema } from './api-key.js';
import {
	reportAppointmentMetricsSchema,
	reportBalancesSchema,
	reportByCategoryDetailSchema,
	reportByCategorySchema,
	reportByResponsibleSchema,
	reportConsistencySchema,
	reportMonthlySchema,
	reportContactDistributionSchema,
	reportSummarySchema,
	reportTransactionDuplicatesSchema,
	reportUntouchedContactsSchema,
	reportCohortsSchema
} from './reports.js';
import { credentialStatusSchema, credentialUpsertSchema } from './credentials.js';
import { ghlConnectionStatus, ghlReconcileTriggerResult } from './ghl-connection.js';
import {
	adConnectionsResponse,
	adConnectionStatus,
	adGoogleCustomerIdUpdate
} from './ads-connection.js';
import {
	aiCorrectionCreateSchema,
	aiCorrectionSchema,
	aiCorrectionsReportSchema
} from './ai-correction.js';
import {
	whatsappAiPromptSchema,
	whatsappAiPromptUpdateSchema
} from './ai-prompt.js';
import {
	permissionMatrixPatchSchema,
	permissionMatrixSchema
} from './permission-matrix.js';
import {
	importBundleCommitResultSchema,
	importBundleDryRunResultSchema,
	importCommitBodySchema,
	importCommitResultSchema,
	importDryRunResultSchema,
	xlsxDownloadSchema
} from './import-export.js';
import {
	dataDeleteExecuteBodySchema,
	dataDeleteExecuteResultSchema,
	dataDeletePreviewBodySchema,
	dataDeletePreviewResultSchema
} from './data-delete.js';
import { webhookSubscriptionCreateSchema, webhookSubscriptionSchema } from './webhook-subscription.js';

/**
 * API contract sketch for /v1 routes.
 * Handlers (MSW now, NestJS later) should conform to these shapes.
 */
export const apiContract = {
	'GET /v1/me': {
		response: meSchema
	},
	'GET /v1/me/organizations': {
		response: meOrganizationListSchema
	},
	'PUT /v1/me/preferences': {
		body: userUiPreferencesUpdateSchema,
		response: userUiPreferencesSchema
	},
	'GET /v1/me/data-export': {
		response: dataExportSchema
	},
	'POST /v1/me/data-deletion-request': {
		response: dataDeletionRequestSchema
	},
	'GET /v1/tenants/current': {
		response: tenantSchema
	},
	'GET /v1/platform/tenants': {
		response: platformTenantListSchema
	},
	'POST /v1/platform/tenants': {
		body: platformTenantCreateSchema,
		response: platformTenantSchema
	},
	'PATCH /v1/platform/tenants/:id': {
		body: platformTenantUpdateSchema,
		response: platformTenantSchema
	},
	'DELETE /v1/platform/tenants/:id': {
		response: platformSoftDeleteResultSchema
	},
	'GET /v1/platform/tenants/:id/members': {
		response: platformMemberListSchema
	},
	'POST /v1/platform/tenants/:id/members': {
		body: platformMemberUpsertSchema,
		response: membershipUserSchema
	},
	'DELETE /v1/platform/tenants/:id/members/:userId': {
		response: softDeleteResultSchema
	},
	'GET /v1/appointments': {
		response: appointmentListPageSchema
	},
	'GET /v1/appointments/:id': {
		response: appointmentSchema
	},
	'DELETE /v1/appointments/:id': {
		response: softDeleteResultSchema
	},
	'GET /v1/operation-alerts': {
		response: operationAlertListPageSchema
	},
	'POST /v1/operation-alerts': {
		body: operationAlertCreateSchema,
		response: operationAlertSchema
	},
	'PATCH /v1/operation-alerts/:id/confirm': {
		response: operationAlertSchema
	},
	'DELETE /v1/operation-alerts/:id': {
		response: softDeleteResultSchema
	},
	'GET /v1/record-suggestions': {
		response: recordUpdateSuggestionListPageSchema
	},
	'POST /v1/record-suggestions/parse': {
		body: recordUpdateSuggestionParseRequestSchema,
		response: recordUpdateSuggestionParseResponseSchema
	},
	'POST /v1/record-suggestions/:id/approve': {
		response: recordUpdateSuggestionSchema
	},
	'POST /v1/record-suggestions/:id/reject': {
		body: recordUpdateSuggestionRejectRequestSchema,
		response: recordUpdateSuggestionSchema
	},
	'GET /v1/contacts': {
		response: cursorPageSchema(contactSchema)
	},
	'GET /v1/contacts/:id': {
		response: contactSchema
	},
	'DELETE /v1/contacts/:id': {
		response: softDeleteResultSchema
	},
	'GET /v1/contacts/:id/finance-summary': {
		response: contactFinanceSummarySchema
	},
	'GET /v1/contacts/:id/data-export': {
		response: contactDataExportSchema
	},
	'POST /v1/contacts/:id/data-deletion-request': {
		response: contactDataDeletionRequestSchema
	},
	'POST /v1/contacts/:id/auto-link-transactions': {
		response: contactAutoLinkTransactionsResultSchema
	},
	'GET /v1/contacts/:id/files': {
		response: z.object({ items: z.array(contactFileSchema) })
	},
	'POST /v1/contacts/:id/files': {
		body: contactFileCreateSchema,
		response: contactFileSchema
	},
	'DELETE /v1/contacts/:id/files/:fileId': {
		response: softDeleteResultSchema
	},
	'GET /v1/contacts/:id/files/:fileId/download': {
		/** Binary stream — not a JSON zod body */
		response: z.unknown()
	},
	'GET /v1/contacts/:id/files/:fileId/preview': {
		/** Binary stream — not a JSON zod body (inline for allowlisted MIME) */
		response: z.unknown()
	},
	'GET /v1/contacts/:id/case-notes': {
		response: z.object({ items: z.array(contactCaseNoteSchema) })
	},
	'POST /v1/contacts/:id/case-notes': {
		body: contactCaseNoteCreateSchema,
		response: contactCaseNoteSchema
	},
	'DELETE /v1/contacts/:id/case-notes/:noteId': {
		response: z.null()
	},
	'PATCH /v1/contacts/bulk-type': {
		body: contactsBulkTypeSchema,
		response: contactsBulkTypeResultSchema
	},
	'GET /v1/contacts/duplicate-groups': {
		response: contactDuplicateGroupsResponseSchema
	},
	'POST /v1/contacts/merge': {
		body: mergeRecordsSchema,
		response: contactSchema
	},
	'GET /v1/settings/contact-types': {
		response: z.object({ items: z.array(contactTypeSchema) })
	},
	'PUT /v1/settings/contact-types/reorder': {
		body: settingsReorderSchema,
		response: settingsReorderResultSchema
	},
	'PATCH /v1/settings/contact-types/:id': {
		body: contactTypeUpdateSchema,
		response: contactTypeSchema
	},
	'GET /v1/settings/organizations': {
		response: z.object({ items: z.array(organizationSchema) })
	},
	'PATCH /v1/settings/organizations/:id': {
		body: organizationUpdateSchema,
		response: organizationSchema
	},
	'GET /v1/appointments/:id/files': {
		response: z.object({ items: z.array(contactFileSchema) })
	},
	'GET /v1/transactions': {
		response: cursorPageSchema(transactionSchema)
	},
	'GET /v1/transactions/:id': {
		response: transactionSchema
	},
	'POST /v1/transactions/audit-draft': {
		body: transactionAuditDraftSchema,
		response: transactionAuditDraftResponseSchema
	},
	'DELETE /v1/transactions/:id': {
		response: softDeleteResultSchema
	},
	'GET /v1/incentives': {
		response: incentiveFileListPageSchema
	},
	'POST /v1/incentives': {
		body: incentiveFileCreateSchema,
		response: incentiveFileSchema
	},
	'PATCH /v1/incentives/:id': {
		body: incentiveFileUpdateSchema,
		response: incentiveFileSchema
	},
	'DELETE /v1/incentives/:id': {
		response: softDeleteResultSchema
	},
	'GET /v1/commissions': {
		response: commissionEntryListPageSchema
	},
	'POST /v1/commissions': {
		body: commissionEntryCreateSchema,
		response: commissionEntrySchema
	},
	'PATCH /v1/commissions/:id': {
		body: commissionEntryUpdateSchema,
		response: commissionEntrySchema
	},
	'DELETE /v1/commissions/:id': {
		response: softDeleteResultSchema
	},
	'GET /v1/fx/rate': {
		query: fxRateQuerySchema,
		response: fxRateResponseSchema
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
	'POST /v1/whatsapp/inbox/process': {
		response: inboundMessageProcessResponseSchema
	},
	'POST /v1/whatsapp/inbox/:id/parse': {
		response: z.object({ records: z.array(transactionDraftSchema) })
	},
	'POST /v1/whatsapp/inbox/:id/approve': {
		response: inboundMessageActionResponseSchema
	},
	'POST /v1/whatsapp/inbox/:id/approve-drafts': {
		body: approveDraftsRequestSchema,
		response: approveDraftsResponseSchema
	},
	'POST /v1/whatsapp/inbox/:id/ignore': {
		response: inboundMessageActionResponseSchema
	},
	'POST /v1/whatsapp/corrections': {
		body: aiCorrectionCreateSchema,
		response: aiCorrectionSchema
	},
	'GET /v1/whatsapp/corrections': {
		response: cursorPageSchema(aiCorrectionSchema)
	},
	'GET /v1/whatsapp/corrections-report': {
		response: aiCorrectionsReportSchema
	},
	'POST /v1/whatsapp/create-contact': {
		body: whatsappCreateContactSchema,
		response: contactSchema
	},
	'POST /v1/whatsapp/create-category': {
		body: whatsappCreateCategorySchema,
		response: financeCategorySchema
	},
	'GET /v1/members': {
		response: cursorPageSchema(membershipUserSchema)
	},
	'POST /v1/members': {
		body: memberCreateSchema,
		response: membershipUserSchema
	},
	'PATCH /v1/members/:id': {
		body: memberUpdateSchema,
		response: membershipUserSchema
	},
	'DELETE /v1/members/:id': {
		response: softDeleteResultSchema
	},
	'POST /v1/members/:id/password-reset': {
		response: memberPasswordResetResultSchema
	},
	'GET /v1/audit-logs': {
		response: cursorPageSchema(auditLogSchema)
	},
	'GET /v1/settings/finance-categories': {
		response: z.object({ items: z.array(financeCategorySchema) })
	},
	'PUT /v1/settings/finance-categories/reorder': {
		body: settingsReorderSchema,
		response: settingsReorderResultSchema
	},
	'GET /v1/settings/appointment-types': {
		response: z.object({ items: z.array(appointmentTypeSettingSchema) })
	},
	'PUT /v1/settings/appointment-types/reorder': {
		body: settingsReorderSchema,
		response: settingsReorderResultSchema
	},
	'GET /v1/settings/credentials/:provider': {
		response: credentialStatusSchema
	},
	'PUT /v1/settings/credentials/:provider': {
		body: credentialUpsertSchema,
		response: credentialStatusSchema
	},
	'GET /v1/settings/ai-prompt': {
		response: whatsappAiPromptSchema
	},
	'PUT /v1/settings/ai-prompt': {
		body: whatsappAiPromptUpdateSchema,
		response: whatsappAiPromptSchema
	},
	'POST /v1/maya/ask': {
		body: mayaAskSchema,
		response: mayaAnswerSchema
	},
	'GET /v1/settings/knowledge': {
		response: knowledgeSettingsSchema
	},
	'GET /v1/settings/knowledge/revisions': {
		response: knowledgeRevisionListSchema
	},
	'PUT /v1/settings/knowledge': {
		body: knowledgeUpdateSchema,
		response: knowledgeSettingsSchema
	},
	'DELETE /v1/settings/knowledge': {
		response: knowledgeSettingsSchema
	},
	'GET /v1/settings/operation-alerts': {
		response: operationAlertSettingsSchema
	},
	'PUT /v1/settings/operation-alerts': {
		body: operationAlertSettingsUpdateSchema,
		response: operationAlertSettingsSchema
	},
	'DELETE /v1/settings/ai-prompt': {
		response: whatsappAiPromptSchema
	},
	'GET /v1/settings/incentive-deadline': {
		response: incentiveDeadlineSettingsSchema
	},
	'PUT /v1/settings/incentive-deadline': {
		body: incentiveDeadlineSettingsUpdateSchema,
		response: incentiveDeadlineSettingsSchema
	},
	'DELETE /v1/settings/incentive-deadline': {
		response: incentiveDeadlineSettingsSchema
	},
	'GET /v1/settings/permissions': {
		response: permissionMatrixSchema
	},
	'PATCH /v1/settings/permissions': {
		body: permissionMatrixPatchSchema,
		response: permissionMatrixSchema
	},
	'GET /v1/settings/import-export/contacts/template.xlsx': {
		response: xlsxDownloadSchema
	},
	'GET /v1/settings/import-export/contacts/export.xlsx': {
		response: xlsxDownloadSchema
	},
	'POST /v1/settings/import-export/contacts/import/dry-run': {
		response: importDryRunResultSchema
	},
	'POST /v1/settings/import-export/contacts/import/commit': {
		body: importCommitBodySchema,
		response: importCommitResultSchema
	},
	'GET /v1/settings/import-export/bundle/template.xlsx': {
		response: xlsxDownloadSchema
	},
	'GET /v1/settings/import-export/bundle/export.xlsx': {
		response: xlsxDownloadSchema
	},
	'POST /v1/settings/import-export/bundle/import/dry-run': {
		response: importBundleDryRunResultSchema
	},
	'POST /v1/settings/import-export/bundle/import/commit': {
		body: importCommitBodySchema,
		response: importBundleCommitResultSchema
	},
	'POST /v1/settings/data-delete/preview': {
		body: dataDeletePreviewBodySchema,
		response: dataDeletePreviewResultSchema
	},
	'POST /v1/settings/data-delete/execute': {
		body: dataDeleteExecuteBodySchema,
		response: dataDeleteExecuteResultSchema
	},
	'GET /v1/integrations/ghl/status': {
		response: ghlConnectionStatus
	},
	'POST /v1/integrations/ghl/reconcile': {
		response: ghlReconcileTriggerResult
	},
	'GET /v1/integrations/ads/status': {
		response: adConnectionsResponse
	},
	'PATCH /v1/integrations/ads/google/customer-id': {
		body: adGoogleCustomerIdUpdate,
		response: adConnectionStatus
	},
	'GET /v1/ad-metrics': {
		response: z.object({ items: z.array(adMetricSchema) })
	},
	'POST /v1/ad-metrics/sync': {
		response: adMetricsSyncResultSchema
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
	'GET /v1/webhook-subscriptions': {
		response: z.object({ items: z.array(webhookSubscriptionSchema) })
	},
	'POST /v1/webhook-subscriptions': {
		body: webhookSubscriptionCreateSchema,
		response: webhookSubscriptionSchema
	},
	'DELETE /v1/webhook-subscriptions/:id': {
		response: z.object({ id: z.string().uuid() })
	},
	'GET /v1/reports/summary': {
		response: reportSummarySchema
	},
	'GET /v1/reports/by-category': {
		response: reportByCategorySchema
	},
	'GET /v1/reports/by-category-detail': {
		response: reportByCategoryDetailSchema
	},
	'GET /v1/reports/by-responsible': {
		response: reportByResponsibleSchema
	},
	'GET /v1/reports/monthly': {
		response: reportMonthlySchema
	},
	'GET /v1/reports/contact-distribution': {
		response: reportContactDistributionSchema
	},
	'GET /v1/reports/balances': {
		response: reportBalancesSchema
	},
	'GET /v1/reports/commission-summary': {
		response: commissionSummarySchema
	},
	'GET /v1/reports/appointment-metrics': {
		response: reportAppointmentMetricsSchema
	},
	'GET /v1/reports/consistency': {
		response: reportConsistencySchema
	},
	'GET /v1/reports/transaction-duplicates': {
		response: reportTransactionDuplicatesSchema
	},
	'GET /v1/reports/untouched-contacts': {
		response: reportUntouchedContactsSchema
	},
	'GET /v1/reports/cohorts': {
		response: reportCohortsSchema
	}
} as const;

export type ApiContract = typeof apiContract;

/** Helper to type a response from the contract map. */
export type ContractResponse<K extends keyof ApiContract> = z.infer<
	ApiContract[K]['response']
>;
