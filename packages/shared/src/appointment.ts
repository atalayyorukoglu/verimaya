import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

export const appointmentStatusSchema = z.enum([
	'scheduled',
	'confirmed',
	'in_progress',
	'completed',
	'cancelled',
	'no_show'
]);

export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export const appointmentSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	patient_id: uuid,
	/** Display name denormalized for list/calendar views */
	patient_display_name: z.string().min(1).max(255),
	title: z.string().min(1).max(255).nullable(),
	appointment_type: z.string().max(128).nullable(),
	status: appointmentStatusSchema.default('scheduled'),
	starts_at: isoDateTime,
	ends_at: isoDateTime.nullable(),
	clinic_name: z.string().max(255).nullable(),
	hotel_name: z.string().max(255).nullable(),
	transfer_note: z.string().max(8000).nullable(),
	/** Directory contacts for logistics parties (names denormalized above) */
	clinic_contact_id: uuid.nullable().default(null),
	hotel_contact_id: uuid.nullable().default(null),
	transfer_contact_id: uuid.nullable().default(null),
	notes: z.string().max(8000).nullable(),
	created_at: isoDateTime,
	updated_at: isoDateTime
});

export type Appointment = z.infer<typeof appointmentSchema>;

export const appointmentCreateSchema = appointmentSchema.omit({
	id: true,
	tenant_id: true,
	patient_display_name: true,
	created_at: true,
	updated_at: true
});

export type AppointmentCreate = z.infer<typeof appointmentCreateSchema>;

export const appointmentUpdateSchema = appointmentCreateSchema.partial();

export type AppointmentUpdate = z.infer<typeof appointmentUpdateSchema>;

export const appointmentStatusCountSchema = z.object({
	status: appointmentStatusSchema,
	count: z.number().int().nonnegative()
});
export type AppointmentStatusCount = z.infer<typeof appointmentStatusCountSchema>;

export const appointmentTypeCountSchema = z.object({
	appointment_type: z.string(),
	count: z.number().int().nonnegative()
});
export type AppointmentTypeCount = z.infer<typeof appointmentTypeCountSchema>;

export const appointmentListAggregatesSchema = z.object({
	status_counts: z.array(appointmentStatusCountSchema),
	type_counts: z.array(appointmentTypeCountSchema)
});
export type AppointmentListAggregates = z.infer<typeof appointmentListAggregatesSchema>;
