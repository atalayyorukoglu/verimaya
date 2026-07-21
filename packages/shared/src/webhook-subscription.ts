import { z } from 'zod';
import { isoDateTime } from './common.js';

/** Domain event types an outbound webhook subscription can receive. */
export const webhookEventTypeSchema = z.enum([
	'transaction.created',
	'transaction.updated',
	'patient.created',
	'appointment.created'
]);
export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;

export const webhookSubscriptionCreateSchema = z.object({
	url: z.string().trim().url().max(2048),
	secret: z.string().trim().min(16).max(500),
	event_types: z.array(webhookEventTypeSchema).min(1)
});
export type WebhookSubscriptionCreate = z.infer<typeof webhookSubscriptionCreateSchema>;

export const webhookSubscriptionSchema = z.object({
	id: z.string().uuid(),
	tenant_id: z.string().uuid(),
	url: z.string(),
	event_types: z.array(z.string()),
	active: z.boolean(),
	created_at: isoDateTime
});
export type WebhookSubscription = z.infer<typeof webhookSubscriptionSchema>;
