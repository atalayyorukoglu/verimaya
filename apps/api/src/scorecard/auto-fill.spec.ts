import { describe, expect, it } from 'vitest';
import {
	scoreAiDisclosure,
	scoreCatchBadOutput,
	scoreConnectedSystems,
	scoreControlProportionality,
	scoreKeyPersonRisk,
	scoreLlmModelKnown,
	scoreRecentCorrections,
	scoreTcoHumanTime
} from './auto-fill.service';

describe('scorecard auto-fill pure scorers (Adım 35)', () => {
	it('does not invent when evidence is missing', () => {
		expect(scoreConnectedSystems(0)).toBeNull();
		expect(scoreLlmModelKnown(null)).toBeNull();
		expect(scoreRecentCorrections(false)).toBeNull();
		expect(scoreKeyPersonRisk([])).toBeNull();
		expect(scoreKeyPersonRisk([{ actor: 'a', count: 3 }])).toBeNull();
		expect(scoreControlProportionality({ approved: 0, ignored: 0 })).toBeNull();
		expect(scoreCatchBadOutput({ ignored: 0, corrections: 0 })).toBeNull();
		expect(scoreAiDisclosure({ known: false, enabled: false })).toBeNull();
		expect(scoreTcoHumanTime({ parseCount: 0, costMicros: 0, decidedCount: 5 })).toBeNull();
		expect(scoreTcoHumanTime({ parseCount: 3, costMicros: 10, decidedCount: 0 })).toBeNull();
	});

	it('fills all eight criteria when evidence is present', () => {
		const suggestions = [
			scoreConnectedSystems(2),
			scoreLlmModelKnown({
				provider: 'openai',
				model: 'gpt-4o-mini',
				path: 'openai_compatible'
			}),
			scoreRecentCorrections(true),
			scoreKeyPersonRisk([
				{ actor: 'solo', count: 20 },
				{ actor: 'other', count: 2 }
			]),
			scoreControlProportionality({ approved: 5, ignored: 2 }),
			scoreCatchBadOutput({ ignored: 2, corrections: 1 }),
			scoreAiDisclosure({ known: true, enabled: true }),
			scoreTcoHumanTime({ parseCount: 4, costMicros: 100, decidedCount: 7 })
		];
		expect(suggestions.every((s) => s !== null)).toBe(true);
		expect(suggestions).toHaveLength(8);
		const ids = new Set(suggestions.map((s) => s!.criterion_id));
		expect(ids).toEqual(
			new Set(['2.4', '3.2', '4.5', '4.6', '5.4', '7.2', '7.6', '8.5'])
		);
		for (const s of suggestions) {
			expect(s!.evidence_note.length).toBeGreaterThan(0);
			expect(s!.evidence_note).toMatch(/^query=/);
		}
	});

	it('marks 4.6 as observation with concentration risk', () => {
		const concentrated = scoreKeyPersonRisk([
			{ actor: 'founder', count: 18 },
			{ actor: 'other', count: 2 }
		]);
		expect(concentrated?.score).toBe(0);
		expect(concentrated?.evidence_note).toMatch(/observation_only=true/);

		const balanced = scoreKeyPersonRisk([
			{ actor: 'a', count: 6 },
			{ actor: 'b', count: 5 },
			{ actor: 'c', count: 4 }
		]);
		expect(balanced?.score).toBe(4);
	});
});
