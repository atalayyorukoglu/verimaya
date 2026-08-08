import { describe, expect, it } from 'vitest';
import { ATTRIBUTION_COVERAGE_THRESHOLD } from '@verimaya/shared';
import { getStore } from './data';
import { buildMarketingReport } from './handlers';

function patientCreatedDay(createdAt: string): string {
	return createdAt.slice(0, 10);
}

function cohortPatients(
	store: ReturnType<typeof getStore>,
	from: string | null,
	to: string | null
) {
	return store.patients.filter((p) => {
		const day = patientCreatedDay(p.created_at);
		if (from && day < from) return false;
		if (to && day > to) return false;
		return true;
	});
}

describe('MSW marketing attribution_missing scenario', () => {
	it('attribution_missing fixture yields null ROAS/CPL/CPT while spend and revenue stay', () => {
		const store = getStore('attribution_missing');
		const report = buildMarketingReport(store, null, null, null);

		expect(report.attribution_missing).toBe(true);
		expect(report.attribution_coverage).toBe(0);
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
		expect(report.attribution_coverage).not.toBeNull();
		expect(report.attribution_coverage!).toBeGreaterThanOrEqual(ATTRIBUTION_COVERAGE_THRESHOLD);
		expect(report.real_roas).not.toBeNull();
		expect(typeof report.real_roas).toBe('number');
	});

	it('one named source among many still keeps attribution_missing (threshold guard)', () => {
		const store = getStore('attribution_missing');
		const baseline = buildMarketingReport(store, null, null, null);
		const inCohort = cohortPatients(
			store,
			baseline.period.effective_from,
			baseline.period.effective_to
		);
		expect(inCohort.length).toBeGreaterThan(1);

		const patient = inCohort[0]!;
		const previous = patient.source;
		patient.source = 'Meta Ads';

		try {
			const report = buildMarketingReport(store, null, null, null);
			expect(report.by_source.some((row) => row.source === 'Meta Ads')).toBe(true);
			expect(report.leads_count).toBe(inCohort.length);
			expect(report.attribution_coverage).toBeCloseTo(1 / report.leads_count);
			expect(report.attribution_coverage!).toBeLessThan(ATTRIBUTION_COVERAGE_THRESHOLD);
			expect(report.attribution_missing).toBe(true);
			expect(report.real_roas).toBeNull();
			expect(report.cost_per_lead).toBeNull();
			expect(report.cost_per_treated).toBeNull();
		} finally {
			patient.source = previous;
		}
	});

	it('coverage at or above threshold publishes ROAS/CPL/CPT', () => {
		const store = getStore('attribution_missing');
		const baseline = buildMarketingReport(store, null, null, null);
		const inCohort = cohortPatients(
			store,
			baseline.period.effective_from,
			baseline.period.effective_to
		);
		expect(inCohort.length).toBeGreaterThan(0);

		const previous = inCohort.map((p) => p.source);
		const needAttributed = Math.ceil(inCohort.length * ATTRIBUTION_COVERAGE_THRESHOLD);
		for (let i = 0; i < needAttributed; i++) {
			inCohort[i]!.source = 'Meta Ads';
		}

		try {
			const report = buildMarketingReport(store, null, null, null);
			expect(report.attribution_coverage).not.toBeNull();
			expect(report.attribution_coverage!).toBeGreaterThanOrEqual(ATTRIBUTION_COVERAGE_THRESHOLD);
			expect(report.attribution_missing).toBe(false);
			expect(report.real_roas).not.toBeNull();
			expect(report.cost_per_lead).not.toBeNull();
		} finally {
			inCohort.forEach((p, i) => {
				p.source = previous[i]!;
			});
		}
	});
});
