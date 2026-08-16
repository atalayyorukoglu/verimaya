import { Logger } from '@nestjs/common';
import type { EmailSender, SendEmailInput, SendEmailResult } from './email.types';

/**
 * Resend HTTP adapter (no SDK). Domain must be verified in Resend dashboard;
 * SPF/DKIM on verimaya.com for deliverability.
 */
export class ResendEmailClient implements EmailSender {
	private readonly logger = new Logger(ResendEmailClient.name);

	constructor(
		private readonly apiKey: string,
		private readonly from: string,
		private readonly fetchFn: typeof fetch = fetch
	) {}

	async send(input: SendEmailInput): Promise<SendEmailResult> {
		try {
			const res = await this.fetchFn('https://api.resend.com/emails', {
				method: 'POST',
				headers: {
					authorization: `Bearer ${this.apiKey}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					from: this.from,
					to: [input.to],
					subject: input.subject,
					text: input.text,
					html: input.html,
					...(input.replyTo ? { reply_to: input.replyTo } : {})
				})
			});

			if (!res.ok) {
				const body = await res.text().catch(() => '');
				const msg = `Resend HTTP ${res.status} (body ${body.length} bytes redacted)`;
				this.logger.warn(msg);
				return { ok: false, error: msg };
			}

			const json = (await res.json()) as { id?: string };
			return { ok: true, id: json.id ?? null };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.warn(`Resend send failed: ${message}`);
			return { ok: false, error: message };
		}
	}
}

/** No-op when RESEND_API_KEY is unset — lead still saved. */
export class NoopEmailClient implements EmailSender {
	private readonly logger = new Logger(NoopEmailClient.name);

	async send(input: SendEmailInput): Promise<SendEmailResult> {
		this.logger.warn(`Email skipped (no RESEND_API_KEY); to=${input.to.slice(0, 3)}…`);
		return { ok: false, error: 'email_not_configured' };
	}
}

export function createEmailSenderFromEnv(
	env: NodeJS.ProcessEnv = process.env
): EmailSender {
	const apiKey = env.RESEND_API_KEY?.trim();
	if (!apiKey) return new NoopEmailClient();
	const from = (env.KARNE_SUMMARY_FROM?.trim() || 'Verimaya <karne@verimaya.com>').trim();
	return new ResendEmailClient(apiKey, from);
}
