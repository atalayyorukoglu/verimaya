import { describe, expect, it } from 'vitest';
import { canAccessPath } from './rbac';

/**
 * `canAccessPath` bilinmeyen yolu bilerek SERBEST sayar (yeni sayfa eklerken kilit
 * kalmasın diye). Bunun bedeli: haritaya yazılmayan her yol herkese açıktır.
 *
 * 2026-09-04'te rapor sayfaları `/reports/*`'tan üst seviyeye taşındı ve haritaya
 * eklenmedikleri için `agent` rolüne açıldılar — önceden `/reports` önekinden izin
 * miras alıyorlardı. Bu testler o gerilemenin tekrarını yakalar.
 */
const REPORT_ROUTES = [
	'/reports',
	'/ai-accuracy',
	'/cohorts',
	'/interventions',
	'/referrals',
	'/untouched'
] as const;

describe('rbac — rapor yüzeyleri', () => {
	it('agent rapor sayfalarını göremez', () => {
		for (const route of REPORT_ROUTES) {
			expect(canAccessPath(route, 'agent'), route).toBe(false);
		}
	});

	it('rapor görebilen roller hepsine erişir', () => {
		for (const role of ['owner', 'admin', 'manager', 'finance', 'readonly'] as const) {
			for (const route of REPORT_ROUTES) {
				expect(canAccessPath(route, role), `${role} → ${route}`).toBe(true);
			}
		}
	});

	it('alt yollar da aynı izni miras alır', () => {
		expect(canAccessPath('/interventions/detay', 'agent')).toBe(false);
		expect(canAccessPath('/interventions/detay', 'manager')).toBe(true);
	});

	it('finans yüzeyi readonly rolüne kapalı kalır', () => {
		expect(canAccessPath('/finance', 'readonly')).toBe(false);
		expect(canAccessPath('/finance', 'finance')).toBe(true);
	});
});
