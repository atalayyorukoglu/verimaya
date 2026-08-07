/**
 * Fire-and-forget karne funnel telemetry.
 * Never throws to callers; never blocks the UX. SSR/prerender-safe (browser guards).
 */
import { browser } from '$app/environment';
import type { IntakeBandId, IntakeEuId, KarneQuestionId } from '$lib/karne/questions';
import { KARNE_LEADS_ENABLED, KARNE_TELEMETRY_ENABLED, PUBLIC_API_URL } from '$lib/env';

const SESSION_ID_KEY = 'verimaya:karne-telemetry-session-id';

/** question_id → epoch ms when first viewed this page load */
const viewedAt = new Map<string, number>();

let starting: Promise<void> | null = null;

export function isKarneTelemetryEnabled(): boolean {
	return KARNE_TELEMETRY_ENABLED;
}

function apiUrl(path: string): string {
	return `${PUBLIC_API_URL.replace(/\/$/, '')}/v1/public/karne/${path}`;
}

function getStoredSessionId(): string | null {
	if (!browser) return null;
	try {
		return sessionStorage.getItem(SESSION_ID_KEY);
	} catch {
		return null;
	}
}

function setStoredSessionId(id: string): void {
	if (!browser) return;
	try {
		sessionStorage.setItem(SESSION_ID_KEY, id);
	} catch {
		/* private mode / quota — ignore */
	}
}

/** Drop telemetry session (new attempt from intro). */
export function clearKarneTelemetrySession(): void {
	if (!browser) return;
	viewedAt.clear();
	starting = null;
	try {
		sessionStorage.removeItem(SESSION_ID_KEY);
	} catch {
		/* ignore */
	}
}

function referrerHost(): string | undefined {
	if (!browser || !document.referrer) return undefined;
	try {
		const host = new URL(document.referrer).hostname;
		return host || undefined;
	} catch {
		return undefined;
	}
}

/** Prefer sendBeacon (survives tab close); fall back to keepalive fetch. */
function postBeacon(path: string, body: unknown): void {
	if (!browser || !isKarneTelemetryEnabled()) return;
	const url = apiUrl(path);
	const payload = JSON.stringify(body);
	try {
		if (typeof navigator.sendBeacon === 'function') {
			const blob = new Blob([payload], { type: 'application/json' });
			if (navigator.sendBeacon(url, blob)) return;
		}
	} catch {
		/* fall through */
	}
	void fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: payload,
		keepalive: true
	}).catch(() => {});
}

async function ensureSessionId(): Promise<string | null> {
	if (!browser || !isKarneTelemetryEnabled()) return null;
	const existing = getStoredSessionId();
	if (existing) return existing;
	if (starting) {
		await starting;
		return getStoredSessionId();
	}
	return null;
}

export type KarneSessionStartInput = {
	band: IntakeBandId;
	eu_exposure: IntakeEuId;
};

/** Create anonymous session; stores session_id. No-ops when disabled or already started. */
export function startSession(input: KarneSessionStartInput): void {
	void startSessionAsync(input);
}

async function startSessionAsync(input: KarneSessionStartInput): Promise<void> {
	if (!browser || !isKarneTelemetryEnabled()) return;
	if (getStoredSessionId()) return;
	if (starting) {
		await starting;
		return;
	}

	starting = (async () => {
		try {
			const res = await fetch(apiUrl('sessions'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					band: input.band,
					eu_exposure: input.eu_exposure,
					referrer_host: referrerHost()
				}),
				keepalive: true
			});
			if (!res.ok) return;
			const data = (await res.json()) as { session_id?: string };
			if (typeof data.session_id === 'string' && data.session_id.length > 0) {
				setStoredSessionId(data.session_id);
			}
		} catch {
			/* swallow — karne UX continues without telemetry */
		}
	})();

	try {
		await starting;
	} finally {
		starting = null;
	}
}

export function trackViewed(questionId: KarneQuestionId): void {
	void (async () => {
		try {
			if (!browser || !isKarneTelemetryEnabled()) return;
			if (!viewedAt.has(questionId)) {
				viewedAt.set(questionId, Date.now());
			}
			const session_id = await ensureSessionId();
			if (!session_id) return;
			postBeacon('events', {
				session_id,
				question_id: questionId,
				event_type: 'viewed'
			});
		} catch {
			/* swallow */
		}
	})();
}

export function trackAnswered(
	questionId: KarneQuestionId,
	choiceId: string,
	dwellMs?: number
): void {
	void (async () => {
		try {
			if (!browser || !isKarneTelemetryEnabled()) return;
			const started = viewedAt.get(questionId);
			const dwell =
				dwellMs ?? (started !== undefined ? Math.max(0, Date.now() - started) : undefined);
			const session_id = await ensureSessionId();
			if (!session_id) return;
			postBeacon('events', {
				session_id,
				question_id: questionId,
				event_type: 'answered',
				choice_id: choiceId,
				...(dwell !== undefined ? { dwell_ms: dwell } : {})
			});
		} catch {
			/* swallow */
		}
	})();
}

export function trackComplete(zeroCount: number): void {
	void (async () => {
		try {
			if (!browser || !isKarneTelemetryEnabled()) return;
			const session_id = await ensureSessionId();
			if (!session_id) return;
			postBeacon('complete', {
				session_id,
				zero_count: zeroCount
			});
		} catch {
			/* swallow */
		}
	})();
}

/**
 * Ensure a karne session exists for lead capture.
 *
 * Reuses an already-started session if one exists, but will NOT silently open a new one
 * when telemetry is disabled (`KARNE_TELEMETRY_ENABLED === false`) — otherwise disabling
 * telemetry would have no real effect: lead capture could still create a session record
 * behind the scenes. When telemetry is off and no session exists yet, lead submission
 * fails closed (`submitKarneLead` reports `reason: 'network'`).
 */
export async function ensureSessionForLead(input: KarneSessionStartInput): Promise<string | null> {
	if (!browser) return null;
	const existing = getStoredSessionId();
	if (existing) return existing;
	if (!isKarneTelemetryEnabled()) return null;
	try {
		const res = await fetch(apiUrl('sessions'), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				band: input.band,
				eu_exposure: input.eu_exposure,
				referrer_host: referrerHost()
			}),
			keepalive: true
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { session_id?: string };
		if (typeof data.session_id === 'string' && data.session_id.length > 0) {
			setStoredSessionId(data.session_id);
			return data.session_id;
		}
	} catch {
		return null;
	}
	return null;
}

export type KarneLeadSummaryPayload = {
	zero_count: number;
	answered_count: number;
	top_weak: string[];
	strong_titles: string[];
	eu_exposure: boolean;
};

export type SubmitKarneLeadInput = {
	email: string;
	consent: true;
	/** Honeypot — must be empty. */
	website: string;
	band: IntakeBandId;
	eu_exposure: IntakeEuId;
	summary: KarneLeadSummaryPayload;
};

export type SubmitKarneLeadResult =
	| { ok: true; emailed: boolean }
	| { ok: false; reason: 'validation' | 'network' };

/** POST /leads — returns structured result for the form UI (not fire-and-forget). */
export async function submitKarneLead(input: SubmitKarneLeadInput): Promise<SubmitKarneLeadResult> {
	if (!browser) return { ok: false, reason: 'network' };
	// LEG-02: gated by PUBLIC_KARNE_LEADS_ENABLED (fail-closed unless true)
	if (!KARNE_LEADS_ENABLED) return { ok: false, reason: 'network' };
	if (input.website.trim() !== '') {
		// Trip honeypot client-side: pretend success so bots don't retry.
		return { ok: true, emailed: true };
	}
	const email = input.email.trim();
	if (!email || !input.consent) {
		return { ok: false, reason: 'validation' };
	}

	try {
		const session_id = await ensureSessionForLead({
			band: input.band,
			eu_exposure: input.eu_exposure
		});
		if (!session_id) return { ok: false, reason: 'network' };

		const res = await fetch(apiUrl('leads'), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				session_id,
				email,
				consent: true,
				website: '',
				summary: input.summary
			}),
			keepalive: true
		});
		if (res.status === 204) return { ok: true, emailed: false };
		if (res.ok) {
			const body = (await res.json().catch(() => null)) as { emailed?: boolean } | null;
			return { ok: true, emailed: body?.emailed === true };
		}
		if (res.status === 400) return { ok: false, reason: 'validation' };
		return { ok: false, reason: 'network' };
	} catch {
		return { ok: false, reason: 'network' };
	}
}
