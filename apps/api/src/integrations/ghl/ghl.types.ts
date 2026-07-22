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
	| 'patient_created'
	| 'patient_updated'
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
	patientId: string | null;
	contact: GhlContactFields | null;
};

/** GoHighLevel API adapter contract — domain code depends on this, not HTTP. */
export interface GhlClient {
	processInboundEvent(event: GhlInboundEvent): Promise<GhlProcessResult>;
}
