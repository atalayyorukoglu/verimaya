import { describe, expect, it } from 'vitest';
import { getStore } from './data';
import { buildMarketingReport } from './handlers';

describe('MSW marketing attribution_missing scenario', () => {
	it('attribution_missing fixture yields null ROAS/CPL/CPT while spend and revenue stay', () => {
		const store = getStore('attribution_missing');
		const report = buildMarketingReport(store, null, null, null);

		expect(report.attribution_missing).toBe(true);
		expect(report.real_roas).toBeNull();
		expect(report.cost_per_lead).toBeNull();
		expect(report.cost_per_treated).toBeNull();
		expect(report.spend_base).toBeGreaterThan(0);
		expect(report.revenue_base).toBeGreaterThan(0);
		expect(report.by_source.length).toBeGreaterThan(0);
		expect(report.by_source.every((row) => row.source === 'Bilinmeyen')).toBe(true);
	});

	it('default fixture has attribution and a numeric real_roas', () => {
		const store = getStore('default');
		const report = buildMarketingReport(store, null, null, null);

		expect(report.attribution_missing).toBe(false);
		expect(report.real_roas).not.toBeNull();
		expect(typeof report.real_roas).toBe('number');
	});

	it('named source in by_source clears attribution_missing (parity with API rule)', () => {
		const store = getStore('attribution_missing');
		const patient = store.patients[0];
		expect(patient).toBeDefined();
		const previous = patient!.source;
		patient!.source = 'Meta Ads';

		try {
			const report = buildMarketingReport(store, null, null, null);
			expect(report.by_source.some((row) => row.source === 'Meta Ads')).toBe(true);
			expect(report.attribution_missing).toBe(false);
			expect(report.real_roas).not.toBeNull();
		} finally {
			patient!.source = previous;
		}
	});
});
