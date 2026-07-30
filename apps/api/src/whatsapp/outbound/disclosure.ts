import type { WhatsappAiDisclosure } from '@verimaya/shared';
import type { OutboundMessageOrigin } from './outbound.port';

export type DisclosureApplyResult = {
	body: string;
	applied: boolean;
};

/**
 * Prepend disclosure text when origin is AI and the tenant setting is enabled.
 * Human-authored messages are never modified.
 */
export function applyAiDisclosure(
	body: string,
	disclosure: Pick<WhatsappAiDisclosure, 'enabled' | 'text'>,
	origin: OutboundMessageOrigin
): DisclosureApplyResult {
	if (origin !== 'ai' || !disclosure.enabled) {
		return { body, applied: false };
	}
	const text = disclosure.text.trim();
	if (!text) {
		return { body, applied: false };
	}
	return {
		body: `${text}\n\n${body}`,
		applied: true
	};
}
