export type GhlInboundEvent = {
	integrationEventId: string;
	tenantId: string;
	payload: Record<string, unknown>;
};

/** GoHighLevel API adapter contract — domain code depends on this, not HTTP. */
export interface GhlClient {
	processInboundEvent(event: GhlInboundEvent): Promise<void>;
}
