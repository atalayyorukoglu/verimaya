import { Injectable } from '@nestjs/common';
import { type AuditActor, writeAuditLog } from '../../common/audit-helper';
import { SettingsService } from '../../settings/settings.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { applyAiDisclosure } from './disclosure';
import type {
	OutboundMessagePort,
	OutboundSendInput,
	OutboundSendResult
} from './outbound.port';

const DISCLOSURE_APPLIED_AUDIT_LABEL = 'whatsapp_outbound_disclosure';

const SYSTEM_ACTOR: AuditActor = {
	actorId: null,
	actorDisplayName: 'system'
};

/**
 * Port boundary: applies WhatsApp AI disclosure before delegating to the transport.
 * Real send is out of scope — transport is typically {@link StubOutboundMessagePort}.
 */
@Injectable()
export class DisclosingOutboundMessagePort implements OutboundMessagePort {
	constructor(
		private readonly inner: OutboundMessagePort,
		private readonly settings: SettingsService,
		private readonly tenantContext: TenantContextService
	) {}

	async send(input: OutboundSendInput): Promise<OutboundSendResult> {
		const disclosure = await this.settings.getAiDisclosure(input.tenantId);
		const { body, applied } = applyAiDisclosure(input.body, disclosure, input.origin);

		const result = await this.inner.send({
			...input,
			body
		});

		if (applied) {
			const actor = input.actor ?? SYSTEM_ACTOR;
			await this.tenantContext.withTenant(input.tenantId, async ({ db }) => {
				await writeAuditLog(
					db,
					input.tenantId,
					actor,
					'create',
					'tenant',
					DISCLOSURE_APPLIED_AUDIT_LABEL
				);
			});
		}

		return {
			jobId: result.jobId,
			bodySent: body,
			disclosureApplied: applied
		};
	}
}
