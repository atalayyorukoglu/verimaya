import { describe, expect, it } from 'vitest';
import { initialGateUnlocked, showsBlockingGate, showsInlineCapture } from './gate';

describe('karne email-capture gate (LEG-01)', () => {
	describe('when leads are disabled (flag absent/false)', () => {
		it('never shows the blocking gate, in either position, regardless of unlocked state', () => {
			expect(showsBlockingGate(false, 'before-result', false)).toBe(false);
			expect(showsBlockingGate(false, 'before-result', true)).toBe(false);
			expect(showsBlockingGate(false, 'after-result', false)).toBe(false);
		});

		it('never shows the inline capture form', () => {
			expect(showsInlineCapture(false, 'before-result')).toBe(false);
			expect(showsInlineCapture(false, 'after-result')).toBe(false);
		});

		it('starts unlocked so the result is never blocked', () => {
			expect(initialGateUnlocked(false, 'before-result')).toBe(true);
			expect(initialGateUnlocked(false, 'after-result')).toBe(true);
		});
	});

	describe('when leads are enabled and gate position is before-result', () => {
		it('starts locked', () => {
			expect(initialGateUnlocked(true, 'before-result')).toBe(false);
		});

		it('shows the blocking gate while locked, and hides it once unlocked', () => {
			expect(showsBlockingGate(true, 'before-result', false)).toBe(true);
			expect(showsBlockingGate(true, 'before-result', true)).toBe(false);
		});

		it('never shows the inline (after-result) form for this position', () => {
			expect(showsInlineCapture(true, 'before-result')).toBe(false);
		});
	});

	describe('when leads are enabled and gate position is after-result', () => {
		it('starts unlocked (no blocking gate for this position)', () => {
			expect(initialGateUnlocked(true, 'after-result')).toBe(true);
		});

		it('never shows the blocking gate', () => {
			expect(showsBlockingGate(true, 'after-result', false)).toBe(false);
			expect(showsBlockingGate(true, 'after-result', true)).toBe(false);
		});

		it('shows the inline capture form', () => {
			expect(showsInlineCapture(true, 'after-result')).toBe(true);
		});
	});
});
