import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

/**
 * Provider-agnostic WhatsApp inbox models (Cloud API primary, WAHA secondary).
 * AI-extracted fields stay as draft until human approval.
 */
export const messageDirectionSchema = z.enum(['inbound', 'outbound']);
export type MessageDirection = z.infer<typeof messageDirectionSchema>;

export const messageStatusSchema = z.enum([
	'pending',
	'sent',
	'delivered',
	'read',
	'failed'
]);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

export const conversationStatusSchema = z.enum(['open', 'pending', 'resolved', 'archived']);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

export const messageSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	conversation_id: uuid,
	direction: messageDirectionSchema,
	status: messageStatusSchema.default('delivered'),
	body: z.string().max(16000).nullable(),
	has_media: z.boolean().default(false),
	external_message_id: z.string().max(255).nullable(),
	sent_at: isoDateTime,
	created_at: isoDateTime
});

export type Message = z.infer<typeof messageSchema>;

export const conversationSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	patient_id: uuid.nullable(),
	patient_display_name: z.string().max(255).nullable(),
	channel: z.literal('whatsapp'),
	external_chat_id: z.string().min(1).max(255),
	contact_name: z.string().max(255).nullable(),
	contact_phone: z.string().max(64).nullable(),
	status: conversationStatusSchema.default('open'),
	assigned_user_id: uuid.nullable(),
	last_message_preview: z.string().max(500).nullable(),
	last_message_at: isoDateTime.nullable(),
	unread_count: z.number().int().nonnegative().default(0),
	created_at: isoDateTime,
	updated_at: isoDateTime
});

export type Conversation = z.infer<typeof conversationSchema>;

export const conversationCreateSchema = conversationSchema.omit({
	id: true,
	tenant_id: true,
	patient_display_name: true,
	last_message_preview: true,
	last_message_at: true,
	unread_count: true,
	created_at: true,
	updated_at: true
});

export type ConversationCreate = z.infer<typeof conversationCreateSchema>;
