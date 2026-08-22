import { BadRequestException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AdMetric, AiCorrection, ApiKey, Appointment, AppointmentTypeSetting, AuditLog, CommissionEntry, Contact, ContactType, FinanceCategory, IncentiveFile, OperationAlert, Organization, ContactCaseNote, ContactFile, RecordUpdateSuggestion, Tenant, Transaction, WebhookSubscription } from '@verimaya/shared';
import {
	calendarDaysBetween,
	commissionEntryStatusSchema,
	deriveOperationAlertStatus,
	hoursUntil,
	incentiveFileStatusSchema,
	operationAlertKindSchema,
	recordUpdateSuggestionConfidenceSchema,
	recordUpdateSuggestionFieldSchema,
	recordUpdateSuggestionStatusSchema,
	utcTodayIsoDate
} from '@verimaya/shared';
import type { AdMetricsDailyRow } from '../db/schema/ad-metrics-daily';
import type { AiCorrectionRow } from '../db/schema/ai-corrections';
import type { ApiKeyRow } from '../db/schema/api-keys';
import type { AppointmentTypeRow } from '../db/schema/appointment-types';
import type { AppointmentRow } from '../db/schema/appointments';
import type { AuditLogRow } from '../db/schema/audit';
import type { CaseNoteRow } from '../db/schema/case-notes';
import type { CommissionEntryRow } from '../db/schema/commission-entries';
import type { ContactTypeRow } from '../db/schema/contact-types';
import type { ContactRow } from '../db/schema/contacts';
import type { FileRow } from '../db/schema/files';
import type { FinanceCategoryRow } from '../db/schema/finance-categories';
import type { IncentiveFileRow } from '../db/schema/incentive-files';
import type { OperationAlertRow } from '../db/schema/operation-alerts';
import type { RecordUpdateSuggestionRow } from '../db/schema/record-update-suggestions';
import type { OrganizationRow } from '../db/schema/organizations';
import type { TenantRow } from '../db/schema/tenants';
import type { TransactionRow } from '../db/schema/transactions';
import type { WebhookSubscriptionRow } from '../db/schema/webhook-subscriptions';
import { toIsoDateTime } from './pagination';

type ParseSchema<T> = {
	safeParse: (
		data: unknown
	) =>
		| { success: true; data: T }
		| {
				success: false;
				error: {
					issues: ReadonlyArray<{
						message: string;
						params?: { code?: string };
					}>;
				};
		  };
};

function errorCodeFromIssues(
	issues: ReadonlyArray<{ message: string; params?: { code?: string } }>
): string {
	const code = issues[0]?.params?.code;
	return typeof code === 'string' && code.length > 0 ? code : 'validation_error';
}

export function parseBody<T>(schema: ParseSchema<T>, body: unknown, req: FastifyRequest): T {
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		throw new BadRequestException({
			error: {
				code: errorCodeFromIssues(parsed.error.issues),
				message: parsed.error.issues.map((issue) => issue.message).join('; ')
			},
			request_id: req.id
		});
	}
	return parsed.data;
}

/**
 * CONTRACT-01 (Faz 2.1): validate a full `@Query()` object against a strict list-query
 * schema. Unlike the old per-field `@Query('cursor')` style, this rejects unknown
 * query parameters with 400 instead of silently ignoring them (same error shape as
 * {@link parseBody}).
 */
export function parseQuery<T>(schema: ParseSchema<T>, query: unknown, req: FastifyRequest): T {
	return parseBody(schema, query, req);
}

export function toContact(row: ContactRow): Contact {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		contact_type_id: row.contactTypeId,
		contact_type_name: row.contactTypeName,
		first_name: row.firstName ?? row.displayName,
		last_name: row.lastName,
		display_name: row.displayName,
		phone: row.phone,
		email: row.email,
		notes: row.notes,
		organization_id: row.organizationId ?? null,
		status: (row.status as Contact['status']) ?? null,
		assigned_user_id: row.assignedUserId ?? null,
		source: row.source ?? null,
		medium: row.medium ?? null,
		campaign: row.campaign ?? null,
		referred_by_contact_id: row.referredByContactId ?? null,
		is_internal: row.isInternal,
		usage_count: row.usageCount,
		created_at: toIsoDateTime(row.createdAt),
		updated_at: toIsoDateTime(row.updatedAt)
	};
}

export function toAppointment(
	row: AppointmentRow,
	extras?: { contact_info_incomplete?: boolean }
): Appointment {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		contact_id: row.contactId,
		contact_display_name: row.contactDisplayName,
		title: row.title,
		appointment_type: row.appointmentType,
		status: row.status as Appointment['status'],
		starts_at: toIsoDateTime(row.startsAt),
		ends_at: row.endsAt ? toIsoDateTime(row.endsAt) : null,
		clinic_name: row.clinicName,
		hotel_name: row.hotelName,
		transfer_note: row.transferNote,
		clinic_contact_id: row.clinicContactId,
		hotel_contact_id: row.hotelContactId,
		transfer_contact_id: row.transferContactId,
		notes: row.notes,
		contact_info_incomplete: extras?.contact_info_incomplete ?? false,
		created_at: toIsoDateTime(row.createdAt),
		updated_at: toIsoDateTime(row.updatedAt)
	};
}

export function toIncentiveFile(row: IncentiveFileRow, today: string = utcTodayIsoDate()): IncentiveFile {
	const status = incentiveFileStatusSchema.parse(row.status);
	return {
		id: row.id,
		tenant_id: row.tenantId,
		contact_id: row.contactId,
		contact_display_name: row.contactDisplayName,
		transaction_id: row.transactionId,
		payment_date: row.paymentDate,
		deadline_at: row.deadlineAt,
		days_left: calendarDaysBetween(today, row.deadlineAt),
		status,
		submitted_at: row.submittedAt,
		note: row.note,
		documents: row.documents ?? [],
		created_at: toIsoDateTime(row.createdAt),
		updated_at: toIsoDateTime(row.updatedAt)
	};
}

export function toOperationAlert(
	row: OperationAlertRow,
	contactDisplayName: string,
	appointmentStartsAt: Date,
	now: Date = new Date()
): OperationAlert {
	const dueAt = toIsoDateTime(row.dueAt);
	const confirmedAt = row.confirmedAt ? toIsoDateTime(row.confirmedAt) : null;
	return {
		id: row.id,
		tenant_id: row.tenantId,
		appointment_id: row.appointmentId,
		contact_display_name: contactDisplayName,
		appointment_starts_at: toIsoDateTime(appointmentStartsAt),
		kind: operationAlertKindSchema.parse(row.kind),
		due_at: dueAt,
		threshold_hours: row.thresholdHours,
		hours_left: hoursUntil(dueAt, now),
		status: deriveOperationAlertStatus(confirmedAt, dueAt, now),
		confirmed_at: confirmedAt,
		confirmed_by: row.confirmedBy,
		created_at: toIsoDateTime(row.createdAt),
		updated_at: toIsoDateTime(row.updatedAt)
	};
}

export function toRecordUpdateSuggestion(
	row: RecordUpdateSuggestionRow,
	contactDisplayName: string
): RecordUpdateSuggestion {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		appointment_id: row.appointmentId,
		contact_display_name: contactDisplayName,
		field: recordUpdateSuggestionFieldSchema.parse(row.field),
		current_value: toIsoDateTime(row.currentValue),
		suggested_value: toIsoDateTime(row.suggestedValue),
		source_text: row.sourceText,
		confidence: recordUpdateSuggestionConfidenceSchema.parse(row.confidence),
		status: recordUpdateSuggestionStatusSchema.parse(row.status),
		decided_at: row.decidedAt ? toIsoDateTime(row.decidedAt) : null,
		decided_by: row.decidedBy,
		reject_reason: row.rejectReason,
		created_at: toIsoDateTime(row.createdAt),
		updated_at: toIsoDateTime(row.updatedAt)
	};
}

export function toCommissionEntry(
	row: CommissionEntryRow,
	beneficiaryDisplayName: string,
	caseDisplayName: string | null
): CommissionEntry {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		beneficiary_contact_id: row.beneficiaryContactId,
		beneficiary_display_name: beneficiaryDisplayName,
		case_contact_id: row.caseContactId,
		case_display_name: caseDisplayName,
		source_transaction_id: row.sourceTransactionId,
		amount: row.amount,
		currency: row.currency as CommissionEntry['currency'],
		amount_base: row.amountBase,
		base_currency: row.baseCurrency as CommissionEntry['base_currency'],
		fx_rate: row.fxRate,
		fx_dated: row.fxDated,
		status: commissionEntryStatusSchema.parse(row.status),
		earned_on: row.earnedOn,
		paid_on: row.paidOn,
		note: row.note,
		created_at: toIsoDateTime(row.createdAt),
		updated_at: toIsoDateTime(row.updatedAt)
	};
}

export function toTransaction(row: TransactionRow): Transaction {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		kind: row.kind as Transaction['kind'],
		title: row.title,
		subtitle: row.subtitle,
		category: row.category,
		occurred_on: row.occurredOn,
		status: row.status as Transaction['status'],
		invoice_status: row.invoiceStatus as Transaction['invoice_status'],
		payment_method: row.paymentMethod,
		amount: row.amount,
		paid_amount: row.paidAmount,
		currency: row.currency as Transaction['currency'],
		amount_base: row.amountBase,
		base_currency: row.baseCurrency as Transaction['base_currency'],
		fx_rate: row.fxRate,
		fx_dated: row.fxDated,
		contact_id: row.contactId,
		contact_display_name: row.contactDisplayName,
		contact_label: row.contactLabel,
		case_contact_id: row.caseContactId,
		responsible_contact_id: row.responsibleContactId,
		description: row.description,
		source_inbound_message_id: row.sourceInboundMessageId,
		source_evidence: row.sourceEvidence ?? null,
		created_at: toIsoDateTime(row.createdAt),
		updated_at: toIsoDateTime(row.updatedAt)
	};
}

export function toFinanceCategory(row: FinanceCategoryRow): FinanceCategory {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		kind: row.kind as FinanceCategory['kind'],
		name: row.name,
		sort_order: row.sortOrder,
		subcategories: row.subcategories,
		created_at: toIsoDateTime(row.createdAt),
		updated_at: toIsoDateTime(row.updatedAt)
	};
}

export function toContactType(row: ContactTypeRow): ContactType {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		name: row.name,
		sort_order: row.sortOrder,
		created_at: toIsoDateTime(row.createdAt)
	};
}

export function toOrganization(row: OrganizationRow): Organization {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		name: row.name,
		created_at: toIsoDateTime(row.createdAt),
		updated_at: toIsoDateTime(row.updatedAt)
	};
}

export function toAppointmentType(row: AppointmentTypeRow): AppointmentTypeSetting {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		name: row.name,
		sort_order: row.sortOrder
	};
}

export function toAuditLog(row: AuditLogRow): AuditLog {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		actor_id: row.actorId,
		actor_display_name: row.actorDisplayName,
		action: row.action as AuditLog['action'],
		entity_type: row.entityType as AuditLog['entity_type'],
		entity_label: row.entityLabel,
		created_at: toIsoDateTime(row.createdAt)
	};
}

export function toAdMetric(row: AdMetricsDailyRow): AdMetric {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		provider: row.provider as AdMetric['provider'],
		date: row.date,
		campaign_id: row.campaignId,
		spend_minor: row.spendMinor,
		currency: (row.currency as AdMetric['currency']) ?? null,
		spend_base: row.spendBase ?? null,
		base_currency: (row.baseCurrency as AdMetric['base_currency']) ?? null,
		fx_rate: row.fxRate ?? null,
		fx_dated: row.fxDated ?? null,
		impressions: row.impressions,
		clicks: row.clicks
	};
}

export function toApiKey(row: ApiKeyRow): ApiKey {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		name: row.name,
		key_prefix: row.keyPrefix,
		scopes: row.scopes as ApiKey['scopes'],
		created_at: toIsoDateTime(row.createdAt),
		// AUDIT-03 (Faz 8): last_used_at / expires_at added to the shared ApiKey
		// shape. NULL when unset (legacy keys; new keys always have expires_at).
		last_used_at: row.lastUsedAt ? toIsoDateTime(row.lastUsedAt) : null,
		expires_at: row.expiresAt ? toIsoDateTime(row.expiresAt) : null,
		revoked_at: row.revokedAt ? toIsoDateTime(row.revokedAt) : null
	};
}

export function toTenant(row: TenantRow, baseCurrencyLocked = false): Tenant {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		base_currency: row.baseCurrency as Tenant['base_currency'],
		base_currency_locked: baseCurrencyLocked,
		timezone: row.timezone as Tenant['timezone'],
		data_retention_until: row.dataRetentionUntil
			? toIsoDateTime(row.dataRetentionUntil)
			: null,
		created_at: toIsoDateTime(row.createdAt)
	};
}

export function toWebhookSubscription(row: WebhookSubscriptionRow): WebhookSubscription {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		url: row.url,
		event_types: row.eventTypes,
		active: row.active,
		created_at: toIsoDateTime(row.createdAt)
	};
}

export function toAiCorrection(row: AiCorrectionRow): AiCorrection {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		inbound_message_id: row.inboundMessageId,
		original_parsed: row.originalParsed as AiCorrection['original_parsed'],
		corrected: row.corrected as AiCorrection['corrected'],
		created_by: row.createdBy,
		created_at: toIsoDateTime(row.createdAt)
	};
}

export function toContactFile(row: FileRow): ContactFile {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		contact_id: row.contactId,
		appointment_id: row.appointmentId,
		appointment_label: row.appointmentLabel,
		filename: row.filename,
		mime_type: row.mimeType,
		size_bytes: row.sizeBytes,
		status: row.status === 'pending' ? 'pending' : 'ready',
		uploaded_by_display_name: row.uploadedByDisplayName,
		created_at: toIsoDateTime(row.createdAt)
	};
}

export function toContactCaseNote(row: CaseNoteRow): ContactCaseNote {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		contact_id: row.contactId,
		body: row.body,
		author_display_name: row.authorDisplayName,
		created_at: toIsoDateTime(row.createdAt)
	};
}
