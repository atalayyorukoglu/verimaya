import { describe, expect, it } from 'vitest';
import {
	MAYA_TOOL_NAMES,
	MAYA_TOOL_PERMISSIONS,
	mayaPeriodRange,
	mayaToolCallSchema
} from './maya-tools.js';

/**
 * AI-11a — model çıktısının **veri üretememesi** sözleşme seviyesinde kanıtlanır.
 * Buradaki testler kırılırsa Maya'nın "rakamı model değil Postgres verir" güvencesi
 * kırılmış demektir.
 */
describe('mayaToolCallSchema', () => {
	it('geçerli araç çağrısını kabul eder', () => {
		const parsed = mayaToolCallSchema.safeParse({
			tool: 'contactBalance',
			params: { contact_ref: '11111111-1111-4111-8111-111111111111' }
		});
		expect(parsed.success).toBe(true);
	});

	it('modelin cevap cümlesi yazma denemesini reddeder', () => {
		const parsed = mayaToolCallSchema.safeParse({
			tool: 'contactBalance',
			params: { contact_ref: '11111111-1111-4111-8111-111111111111' },
			answer: 'Yılmaz bey 12.500 TL borçlu'
		});
		expect(parsed.success).toBe(false);
	});

	it('parametreye uydurma rakam eklenemez', () => {
		const parsed = mayaToolCallSchema.safeParse({
			tool: 'contactBalance',
			params: {
				contact_ref: '11111111-1111-4111-8111-111111111111',
				outstanding_base: 1_250_000
			}
		});
		expect(parsed.success).toBe(false);
	});

	it('dönem kapalı küme dışına çıkamaz (serbest tarih yok)', () => {
		expect(
			mayaToolCallSchema.safeParse({
				tool: 'periodSummary',
				params: { period: '2026-08' }
			}).success
		).toBe(false);
		expect(
			mayaToolCallSchema.safeParse({
				tool: 'periodSummary',
				params: { from: '2026-08-01', to: '2026-08-22' }
			}).success
		).toBe(false);
	});

	it('temassızlık eşiği 30/60/90 dışına çıkamaz', () => {
		expect(
			mayaToolCallSchema.safeParse({ tool: 'untouchedContacts', params: { days: 45 } }).success
		).toBe(false);
		expect(
			mayaToolCallSchema.safeParse({ tool: 'untouchedContacts', params: { days: 60 } }).success
		).toBe(true);
	});

	it('listedeki araç adı dışında bir şey seçilemez', () => {
		expect(
			mayaToolCallSchema.safeParse({ tool: 'rawSql', params: {} }).success
		).toBe(false);
	});
});

describe('MAYA_TOOL_PERMISSIONS', () => {
	it('her araç için izin tanımlıdır — izinsiz araç eklenemez', () => {
		for (const tool of MAYA_TOOL_NAMES) {
			expect(MAYA_TOOL_PERMISSIONS[tool]).toBeDefined();
		}
	});

	it('finans araçları finance:read ister', () => {
		expect(MAYA_TOOL_PERMISSIONS.contactBalance).toEqual({
			resource: 'finance',
			action: 'read'
		});
		expect(MAYA_TOOL_PERMISSIONS.openBalances).toEqual({ resource: 'finance', action: 'read' });
		expect(MAYA_TOOL_PERMISSIONS.periodSummary).toEqual({ resource: 'finance', action: 'read' });
	});
});

describe('mayaPeriodRange', () => {
	it('bu ay: ayın 1\'inden bugüne', () => {
		expect(mayaPeriodRange('this_month', '2026-08-22')).toEqual({
			from: '2026-08-01',
			to: '2026-08-22'
		});
	});

	it('geçen ay: tam ay aralığı', () => {
		expect(mayaPeriodRange('last_month', '2026-08-22')).toEqual({
			from: '2026-07-01',
			to: '2026-07-31'
		});
	});

	it('yıl başında geçen ay bir önceki yıla düşer', () => {
		expect(mayaPeriodRange('last_month', '2026-01-09')).toEqual({
			from: '2025-12-01',
			to: '2025-12-31'
		});
	});

	it('son 7 / 30 gün bugünü dahil eder', () => {
		expect(mayaPeriodRange('last_7_days', '2026-08-22')).toEqual({
			from: '2026-08-16',
			to: '2026-08-22'
		});
		expect(mayaPeriodRange('last_30_days', '2026-08-22')).toEqual({
			from: '2026-07-24',
			to: '2026-08-22'
		});
	});

	it('bu yıl: 1 Ocak\'tan bugüne', () => {
		expect(mayaPeriodRange('this_year', '2026-08-22')).toEqual({
			from: '2026-01-01',
			to: '2026-08-22'
		});
	});
});
