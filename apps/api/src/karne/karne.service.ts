import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { karneEvents, karneSessions } from '../db/schema/karne-events';
import type { KarneComplete, KarneEventCreate, KarneSessionCreate } from './karne.schemas';

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

@Injectable()
export class KarneService {
	constructor(private readonly db: DbService) {}

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

	private async sessionExists(sessionId: string): Promise<boolean> {
		const [row] = await this.db.client
			.select({ id: karneSessions.id })
			.from(karneSessions)
			.where(eq(karneSessions.id, sessionId))
			.limit(1);
		return Boolean(row);
	}
}
