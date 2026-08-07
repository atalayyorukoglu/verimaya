export type { EmailSender, SendEmailInput, SendEmailResult } from './email.types';
export { ResendEmailClient, NoopEmailClient, createEmailSenderFromEnv } from './resend.client';
export { buildKarneSummaryEmail } from './karne-summary.email';
