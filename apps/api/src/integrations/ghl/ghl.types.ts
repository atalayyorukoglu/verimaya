export type GhlInboundEvent = {
	integrationEventId: string;
	tenantId: string;
	payload: Record<string, unknown>;
};

/** Detected GHL entity kind for an inbound webhook payload. */
export type GhlEventKind = 'contact' | 'opportunity' | 'unknown';

/** Outcome of fixture-backed inbound processing (no OAuth). */
export type GhlSyncAction =
	| 'logged'
	| 'contact_created'
	| 'contact_updated'
	| 'skipped_incomplete'
	| 'skipped_unknown';

/** Contact fields extracted from a fixture-shaped GHL webhook payload. */
export type GhlContactFields = {
	externalId: string | null;
	fullName: string | null;
	phone: string | null;
	email: string | null;
};

/** Structured result of processing a single inbound GHL event. */
export type GhlProcessResult = {
	kind: GhlEventKind;
	externalId: string | null;
	summary: string;
	action: GhlSyncAction;
	contactId: string | null;
	contact: GhlContactFields | null;
};

/** Normalized remote contact from GHL Contacts API (Adım 41+). */
export type GhlRemoteContact = {
	id: string;
	locationId: string | null;
	fullName: string | null;
	phone: string | null;
	email: string | null;
	dateUpdated: string | null;
};

export type GhlListContactsParams = {
	limit?: number;
	startAfterId?: string;
	query?: string;
};

export type GhlListContactsResult = {
	contacts: GhlRemoteContact[];
	nextStartAfterId: string | null;
};

/** Nest DI token for {@link GhlClient}. */
export const GHL_CLIENT = Symbol('GHL_CLIENT');

/**
 * GoHighLevel adapter contract — domain/queue code depends on this, not fetch.
 * Inbound webhooks stay queue-first; HTTP methods are for reconcile / pull (Adım 43).
 */
export interface GhlClient {
	processInboundEvent(event: GhlInboundEvent): Promise<GhlProcessResult>;
	getContact(tenantId: string, contactId: string): Promise<GhlRemoteContact | null>;
	listContacts(tenantId: string, params?: GhlListContactsParams): Promise<GhlListContactsResult>;
}
