export type GhlInboundEvent = {
	integrationEventId: string;
	tenantId: string;
	payload: Record<string, unknown>;
};

/** Detected GHL entity kind for an inbound webhook payload. */
export type GhlEventKind = 'contact' | 'opportunity' | 'unknown';

/** Structured result of processing a single inbound GHL event (Faz 4 skeleton — no writes yet). */
export type GhlProcessResult = {
	kind: GhlEventKind;
	externalId: string | null;
	summary: string;
};

/** GoHighLevel API adapter contract — domain code depends on this, not HTTP. */
export interface GhlClient {
	processInboundEvent(event: GhlInboundEvent): Promise<GhlProcessResult>;
}
