import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';
import { transactionKindSchema } from './transaction.js';

export const financeCategorySchema = z.object({
	id: uuid,
	tenant_id: uuid,
	kind: transactionKindSchema,
	name: z.string().min(1).max(128),
	sort_order: z.number().int().nonnegative().default(0),
	subcategories: z.array(z.string().min(1).max(128)).default([]),
	created_at: isoDateTime,
	updated_at: isoDateTime
});

export type FinanceCategory = z.infer<typeof financeCategorySchema>;

export const financeCategoryCreateSchema = z.object({
	kind: transactionKindSchema,
	name: z.string().min(1).max(128),
	subcategories: z.array(z.string().min(1).max(128)).optional()
});

export type FinanceCategoryCreate = z.infer<typeof financeCategoryCreateSchema>;

export const financeCategoryUpdateSchema = z.object({
	kind: transactionKindSchema.optional(),
	name: z.string().min(1).max(128).optional(),
	sort_order: z.number().int().nonnegative().optional(),
	subcategories: z.array(z.string().min(1).max(128)).optional()
});

export type FinanceCategoryUpdate = z.infer<typeof financeCategoryUpdateSchema>;

export const appointmentTypeSettingSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	name: z.string().min(1).max(128),
	sort_order: z.number().int().nonnegative().default(0)
});

export type AppointmentTypeSetting = z.infer<typeof appointmentTypeSettingSchema>;
