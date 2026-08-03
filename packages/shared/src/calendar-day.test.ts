import { describe, expect, it } from 'vitest';
import { tenantDayRange, toTenantDayKey } from './calendar-day.js';

describe('toTenantDayKey', () => {
	it('Europe/Istanbul — winter (UTC+3)', () => {
		// 2026-01-15 22:00 UTC = 2026-01-16 01:00 Istanbul
		const date = new Date('2026-01-15T22:00:00.000Z');
		expect(toTenantDayKey(date, 'Europe/Istanbul')).toBe('2026-01-16');
	});

	it('Europe/Istanbul — summer DST (UTC+3)', () => {
		// 2026-07-15 21:00 UTC = 2026-07-16 00:00 Istanbul (TR stays UTC+3 year-round since 2016)
		const date = new Date('2026-07-15T21:00:00.000Z');
		expect(toTenantDayKey(date, 'Europe/Istanbul')).toBe('2026-07-16');
	});

	it('Asia/Riyadh — no DST', () => {
		const date = new Date('2026-03-01T23:30:00.000Z');
		expect(toTenantDayKey(date, 'Asia/Riyadh')).toBe('2026-03-02');
	});
});

describe('tenantDayRange', () => {
	it('Europe/Istanbul — winter day bounds', () => {
		const { start, endExclusive } = tenantDayRange('2026-01-15', 'Europe/Istanbul');
		expect(start.toISOString()).toBe('2026-01-14T21:00:00.000Z');
		expect(endExclusive.toISOString()).toBe('2026-01-15T21:00:00.000Z');
	});

	it('Europe/Istanbul — summer day bounds', () => {
		const { start, endExclusive } = tenantDayRange('2026-07-15', 'Europe/Istanbul');
		expect(start.toISOString()).toBe('2026-07-14T21:00:00.000Z');
		expect(endExclusive.toISOString()).toBe('2026-07-15T21:00:00.000Z');
	});

	it('Asia/Riyadh — fixed UTC+3 offset', () => {
		const { start, endExclusive } = tenantDayRange('2026-03-01', 'Asia/Riyadh');
		expect(start.toISOString()).toBe('2026-02-28T21:00:00.000Z');
		expect(endExclusive.toISOString()).toBe('2026-03-01T21:00:00.000Z');
	});

	it('Europe/London — DST spring forward day (2026-03-29)', () => {
		const { start, endExclusive } = tenantDayRange('2026-03-29', 'Europe/London');
		// GMT→BST: local day is 23h; next midnight is 23:00 UTC same calendar UTC date
		expect(start.toISOString()).toBe('2026-03-29T00:00:00.000Z');
		expect(endExclusive.toISOString()).toBe('2026-03-29T23:00:00.000Z');
	});

	it('Europe/London — GMT winter day', () => {
		const { start, endExclusive } = tenantDayRange('2026-01-15', 'Europe/London');
		expect(start.toISOString()).toBe('2026-01-15T00:00:00.000Z');
		expect(endExclusive.toISOString()).toBe('2026-01-16T00:00:00.000Z');
	});

	it('UTC — month end (Feb 28 non-leap)', () => {
		const { start, endExclusive } = tenantDayRange('2026-02-28', 'UTC');
		expect(start.toISOString()).toBe('2026-02-28T00:00:00.000Z');
		expect(endExclusive.toISOString()).toBe('2026-03-01T00:00:00.000Z');
	});

	it('round-trip: instant inside range maps back to day key', () => {
		const dayKey = '2026-06-10';
		const tz = 'Europe/Istanbul';
		const { start, endExclusive } = tenantDayRange(dayKey, tz);
		const mid = new Date((start.getTime() + endExclusive.getTime()) / 2);
		expect(toTenantDayKey(mid, tz)).toBe(dayKey);
	});
});
