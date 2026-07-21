import { BadRequestException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type {
	AdMetric,
	ApiKey,
	Appointment,
	AuditLog,
	Contact,
	ContactType,
	FinanceCategory,
	Patient,
	PatientFile,
	Transaction
} from '@verimaya/shared';
import type { AdMetricsDailyRow } from '../db/schema/ad-metrics-daily';
import type { ApiKeyRow } from '../db/schema/api-keys';
import type { AppointmentRow } from '../db/schema/appointments';
import type { AuditLogRow } from '../db/schema/audit';
import type { ContactTypeRow } from '../db/schema/contact-types';
import type { ContactRow } from '../db/schema/contacts';
import type { FileRow } from '../db/schema/files';
import type { FinanceCategoryRow } from '../db/schema/finance-categories';
import type { PatientRow } from '../db/schema/patients';
import type { TransactionRow } from '../db/schema/transactions';
import { toIsoDateTime } from './pagination';

type ParseSchema<T> = {
	safeParse: (
		data: unknown
	) =>
		| { success: true; data: T }
		| { success: false; error: { issues: ReadonlyArray<{ message: string }> } };
};

export function parseBody<T>(schema: ParseSchema<T>, body: unknown, req: FastifyRequest): T {
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		throw new BadRequestException({
			error: {
				code: 'validation_error',
				message: parsed.error.issues.map((issue) => issue.message).join('; ')
			},
			request_id: req.id
		});
	}
	return parsed.data;
}

export function toPatient(row: PatientRow): Patient {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		full_name: row.fullName,
		phone: row.phone,
		email: row.email,
		status: row.status as Patient['status'],
		source: row.source,
		notes: row.notes,
		assigned_user_id: row.assignedUserId,
		contact_id: row.contactId,
		created_at: toIsoDateTime(row.createdAt),
		updated_at: toIsoDateTime(row.updatedAt)
	};
}

export function toContact(row: ContactRow): Contact {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		contact_type_id: row.contactTypeId,
		contact_type_name: row.contactTypeName,
		display_name: row.displayName,
		phone: row.phone,
		email: row.email,
		notes: row.notes,
		is_internal: row.isInternal,
		usage_count: row.usageCount,
		created_at: toIsoDateTime(row.createdAt),
		updated_at: toIsoDateTime(row.updatedAt)
	};
}

export function toAppointment(row: AppointmentRow): Appointment {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		patient_id: row.patientId,
		patient_display_name: row.patientDisplayName,
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
		patient_id: row.patientId,
		patient_display_name: row.patientDisplayName,
		contact_id: row.contactId,
		contact_label: row.contactLabel,
		description: row.description,
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
		revoked_at: row.revokedAt ? toIsoDateTime(row.revokedAt) : null
	};
}

export function toPatientFile(row: FileRow): PatientFile {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		patient_id: row.patientId,
		appointment_id: row.appointmentId,
		appointment_label: row.appointmentLabel,
		filename: row.filename,
		mime_type: row.mimeType,
		size_bytes: row.sizeBytes,
		uploaded_by_display_name: row.uploadedByDisplayName,
		created_at: toIsoDateTime(row.createdAt)
	};
}
