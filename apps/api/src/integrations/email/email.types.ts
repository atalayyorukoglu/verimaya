export type SendEmailInput = {
	to: string;
	subject: string;
	text: string;
	html: string;
	/** Reply-To address (optional). */
	replyTo?: string;
};

export type SendEmailResult = { ok: true; id: string | null } | { ok: false; error: string };

export interface EmailSender {
	send(input: SendEmailInput): Promise<SendEmailResult>;
}
