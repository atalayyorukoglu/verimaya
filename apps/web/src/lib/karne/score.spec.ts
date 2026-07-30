import { describe, expect, it } from 'vitest';
import { karneQuestions } from './questions';
import { scoreKarne, type KarneAnswers } from './score';

function allChoice(letter: 'a' | 'b' | 'c'): KarneAnswers {
	const answers: KarneAnswers = {};
	for (const q of karneQuestions) {
		answers[q.id] = `${q.id}-${letter}`;
	}
	return answers;
}

describe('scoreKarne', () => {
	it('all 4 → zeroCount 0 and ten strong questions', () => {
		const result = scoreKarne(allChoice('a'), { band: '1-4', eu: 'hayir' });
		expect(result.zeroCount).toBe(0);
		expect(result.strongQuestions).toHaveLength(10);
		expect(result.answeredCount).toBe(10);
		expect(result.topThreeWeak).toHaveLength(0);
	});

	it('all 0 → zeroCount 10 and three weak highlights', () => {
		const result = scoreKarne(allChoice('c'), { band: '5-15', eu: 'hayir' });
		expect(result.zeroCount).toBe(10);
		expect(result.strongQuestions).toHaveLength(0);
		expect(result.topThreeWeak).toHaveLength(3);
		expect(result.topThreeWeak.map((q) => q.id)).toEqual(['s1', 's2', 's3']);
	});

	it('mixed + EU=evet → S4 and S8 lead topThreeWeak', () => {
		const answers = allChoice('a');
		answers.s1 = 's1-c';
		answers.s2 = 's2-c';
		answers.s4 = 's4-c';
		answers.s8 = 's8-c';
		answers.s10 = 's10-c';

		const result = scoreKarne(answers, { band: '16+', eu: 'evet' });
		expect(result.euExposure).toBe(true);
		expect(result.zeroCount).toBe(5);
		expect(result.topThreeWeak.map((q) => q.id)).toEqual(['s4', 's8', 's1']);
	});

	it('S4 first two choices both score 4', () => {
		const s4 = karneQuestions.find((q) => q.id === 's4');
		expect(s4).toBeDefined();
		expect(s4!.choices[0].score).toBe(4);
		expect(s4!.choices[1].score).toBe(4);
		expect(s4!.choices[2].score).toBe(0);

		const viaA = scoreKarne({ s4: 's4-a' }, { band: null, eu: null });
		const viaB = scoreKarne({ s4: 's4-b' }, { band: null, eu: null });
		expect(viaA.strongQuestions.map((q) => q.id)).toContain('s4');
		expect(viaB.strongQuestions.map((q) => q.id)).toContain('s4');
		expect(viaA.zeroCount).toBe(0);
		expect(viaB.zeroCount).toBe(0);
	});

	it('result has no aggregate score or percent fields', () => {
		const result = scoreKarne(allChoice('b'), { band: '1-4', eu: 'emin-degilim' });
		const bannedKeys = ['total' + 'Score', 'percent' + 'age', 'percent'] as const;
		for (const key of bannedKeys) {
			expect(key in result).toBe(false);
		}
		expect(Object.keys(result).sort()).toEqual(
			[
				'answeredCount',
				'euExposure',
				'strongQuestions',
				'topThreeWeak',
				'zeroCount',
				'zeroQuestions'
			].sort()
		);
	});
});
