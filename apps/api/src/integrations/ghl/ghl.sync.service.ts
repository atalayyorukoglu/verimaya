import { Injectable, Logger } from '@nestjs/common';
import { detectGhlEventKind, extractGhlExternalId } from './ghl.mapper';
import type { GhlInboundEvent, GhlProcessResult } from './ghl.types';

/**
 * GHL sync skeleton (Faz 4). No OAuth/HTTP client yet — this only detects and logs the
 * parsed event kind so the integration processor + `ghl.reconcile` job have a real seam
 * to plug the field-owned sync into once the adapter ships.
 */
@Injectable()
export class GhlSyncService {
	private readonly logger = new Logger(GhlSyncService.name);

	/** Detects contact/opportunity from an inbound webhook payload; no writes yet. */
	parseInboundEvent(event: GhlInboundEvent): GhlProcessResult {
		const kind = detectGhlEventKind(event.payload);
		const externalId = extractGhlExternalId(event.payload, kind);
		const summary =
			kind === 'unknown'
				? `unrecognized GHL payload shape (event ${event.integrationEventId})`
				: `${kind} ${externalId ?? '(no id)'}`;

		this.logger.log(
			`parsed GHL event ${event.integrationEventId} (tenant ${event.tenantId}): ${summary}`
		);

		return { kind, externalId, summary };
	}

	/**
	 * `ghl.reconcile` job handler (Faz 4 skeleton). Periodic reconciliation against the GHL
	 * API is not implemented yet — no OAuth/HTTP adapter exists — so this only logs. Intended
	 * cadence once real: every 6h per tenant with an active GHL credential, diffing contacts/
	 * opportunities updated since the last successful run.
	 */
	async reconcile(tenantId: string): Promise<void> {
		this.logger.debug(`ghl.reconcile noop for tenant ${tenantId} (no OAuth adapter yet)`);
	}
}
