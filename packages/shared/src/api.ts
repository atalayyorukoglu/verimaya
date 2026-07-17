import { z } from 'zod';
import { cursorPageSchema } from './common.js';
import { patientSchema } from './patient.js';
import { appointmentSchema } from './appointment.js';
import { transactionSchema } from './transaction.js';
import { conversationSchema, messageSchema } from './conversation.js';
import { tenantSchema } from './tenant.js';
import { membershipUserSchema } from './user.js';

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
	'GET /v1/transactions': {
		response: cursorPageSchema(transactionSchema)
	},
	'GET /v1/transactions/:id': {
		response: transactionSchema
	},
	'GET /v1/conversations': {
		response: cursorPageSchema(conversationSchema)
	},
	'GET /v1/conversations/:id': {
		response: conversationSchema
	},
	'GET /v1/conversations/:id/messages': {
		response: cursorPageSchema(messageSchema)
	}
} as const;

export type ApiContract = typeof apiContract;

/** Helper to type a response from the contract map. */
export type ContractResponse<K extends keyof ApiContract> = z.infer<
	ApiContract[K]['response']
>;
