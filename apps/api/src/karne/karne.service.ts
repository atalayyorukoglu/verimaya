import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { karneEvents, karneLeads, karneSessions } from '../db/schema/karne-events';
import {
	buildKarneSummaryEmail,
	type EmailSender
} from '../integrations/email';
import type {
	KarneComplete,
	KarneEventCreate,
	KarneLeadCreate,
	KarneSessionCreate
} from './karne.schemas';

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

/** Coarse UA family only — never store the raw User-Agent string. */
export function userAgentFamily(ua: string | undefined): string | null {
	if (!ua) return null;
	const lower = ua.toLowerCase();
	if (lower.includes('edg/')) return 'edge';
	if (lower.includes('chrome/') || lower.includes('crios/')) return 'chrome';
	if (lower.includes('firefox/') || lower.includes('fxios/')) return 'firefox';
	if (lower.includes('safari/') && !lower.includes('chrome')) return 'safari';
	if (lower.includes('opera') || lower.includes('opr/')) return 'opera';
	return 'other';
}

export type KarneLeadResult = { emailed: boolean };

@Injectable()
export class KarneService {
	private readonly logger = new Logger(KarneService.name);

	constructor(
		private readonly db: DbService,
		@Inject(EMAIL_SENDER) private readonly email: EmailSender
	) {}

	async createSession(
		input: KarneSessionCreate,
		opts: { userAgent?: string }
	): Promise<{ session_id: string }> {
		const [row] = await this.db.client
			.insert(karneSessions)
			.values({
				band: input.band,
				euExposure: input.eu_exposure,
				referrer: input.referrer_host ?? null,
				userAgentFamily: userAgentFamily(opts.userAgent)
			})
			.returning({ id: karneSessions.id });

		return { session_id: row!.id };
	}

	async recordEvent(input: KarneEventCreate): Promise<void> {
		const exists = await this.sessionExists(input.session_id);
		if (!exists) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Karne session not found' }
			});
		}

		await this.db.client
			.insert(karneEvents)
			.values({
				sessionId: input.session_id,
				questionId: input.question_id,
				eventType: input.event_type,
				choiceId: input.choice_id ?? null,
				dwellMs: input.dwell_ms ?? null
			})
			.onConflictDoNothing({
				target: [karneEvents.sessionId, karneEvents.questionId, karneEvents.eventType]
			});

		await this.db.client
			.update(karneSessions)
			.set({ lastSeenAt: new Date() })
			.where(eq(karneSessions.id, input.session_id));
	}

	async complete(input: KarneComplete): Promise<void> {
		const exists = await this.sessionExists(input.session_id);
		if (!exists) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Karne session not found' }
			});
		}

		await this.db.client
			.update(karneSessions)
			.set({
				completed: true,
				zeroCount: input.zero_count,
				lastSeenAt: new Date()
			})
			.where(eq(karneSessions.id, input.session_id));
	}

	/**
	 * Idempotent on email: duplicate address returns without inserting a new row.
	 * Honeypot (`website`) is rejected in the zod schema before this runs.
	 * Summary email is best-effort: lead save succeeds even if mail fails.
	 */
	async createLead(input: KarneLeadCreate): Promise<KarneLeadResult> {
		const exists = await this.sessionExists(input.session_id);
		if (!exists) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Karne session not found' }
			});
		}

		const email = input.email.trim().toLowerCase();
		await this.db.client
			.insert(karneLeads)
			.values({
				sessionId: input.session_id,
				email,
				consentAt: new Date()
			})
			.onConflictDoNothing({ target: karneLeads.email });

		if (!input.summary) {
			this.logger.warn(`Karne lead saved without summary; email skipped for ${email.slice(0, 3)}…`);
			return { emailed: false };
		}

		const built = buildKarneSummaryEmail(input.summary);
		const replyTo = process.env.KARNE_SUMMARY_REPLY_TO?.trim() || undefined;
		const result = await this.email.send({
			to: email,
			subject: built.subject,
			text: built.text,
			html: built.html,
			replyTo
		});
		if (!result.ok) {
			this.logger.warn(`Karne summary email failed: ${result.error}`);
			return { emailed: false };
		}
		return { emailed: true };
	}

	private async sessionExists(sessionId: string): Promise<boolean> {
		const [row] = await this.db.client
			.select({ id: karneSessions.id })
			.from(karneSessions)
			.where(eq(karneSessions.id, sessionId))
			.limit(1);
		return Boolean(row);
	}
}
