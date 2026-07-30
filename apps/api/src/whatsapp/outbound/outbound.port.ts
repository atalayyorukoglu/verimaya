import type { AuditActor } from '../../common/audit-helper';

export type OutboundMessageOrigin = 'ai' | 'human';

export type OutboundSendInput = {
	tenantId: string;
	to: string;
	body: string;
	origin: OutboundMessageOrigin;
	/** Optional actor for audit when disclosure is applied. */
	actor?: AuditActor;
};

export type OutboundSendResult = {
	jobId: string;
	/** Body after disclosure hook (what the transport would send). */
	bodySent: string;
	disclosureApplied: boolean;
};

/**
 * Domain port for WhatsApp outbound — real WAHA/HTTP transport is out of scope (Adım 24).
 * Implementations must go through disclosure at the port boundary for `origin: 'ai'`.
 */
export interface OutboundMessagePort {
	send(input: OutboundSendInput): Promise<OutboundSendResult>;
}

export const OUTBOUND_MESSAGE_PORT = Symbol('OUTBOUND_MESSAGE_PORT');

/** Durable ledger job type written by the stub transport (no provider send). */
export const WHATSAPP_OUTBOUND_STUB_JOB_TYPE = 'whatsapp.outbound.stub';
