import { BadRequestException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type {
	Appointment,
	Contact,
	Patient,
	Transaction
} from '@verimaya/shared';
import type { AppointmentRow } from '../db/schema/appointments';
import type { ContactRow } from '../db/schema/contacts';
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
