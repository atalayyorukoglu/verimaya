import { describe, expect, it } from 'vitest';
import {
	buildDefaultPermissionMatrix,
	matrixAllows,
	type PermissionMatrix
} from './permission-matrix.js';

/**
 * `matrixAllows` arayüzün "düzenleyebilir mi" kararını sunucununkiyle aynı
 * yerden okur. Rol bakmak yetmiyordu: kiracı admin'in `settings:update`
 * iznini kısıtladığında rol admin kalıyor ama sunucu 403 dönüyor.
 */
function matrisKur(overrides: Partial<PermissionMatrix['effective']> = {}) {
	const defaults = buildDefaultPermissionMatrix();
	return { effective: { ...defaults, ...overrides } } as Pick<PermissionMatrix, 'effective'>;
}

describe('matrixAllows', () => {
	it('varsayılanda owner ve admin ayarları düzenleyebilir', () => {
		const m = matrisKur();
		expect(matrixAllows(m, 'owner', 'settings', 'update')).toBe(true);
		expect(matrixAllows(m, 'admin', 'settings', 'update')).toBe(true);
	});

	it('varsayılanda diğer roller ayarları düzenleyemez', () => {
		const m = matrisKur();
		for (const role of ['manager', 'agent', 'finance', 'readonly'] as const) {
			expect(matrixAllows(m, role, 'settings', 'update')).toBe(false);
			expect(matrixAllows(m, role, 'settings', 'read')).toBe(true);
		}
	});

	/** Asıl mesele: kısıtlama sonrası arayüz de sunucu gibi hayır demeli. */
	it('kiracı kısıtlaması admin düzenlemesini kapatır', () => {
		const defaults = buildDefaultPermissionMatrix();
		const m = matrisKur({ admin: { ...defaults.admin, settings: ['read'] } });
		expect(matrixAllows(m, 'admin', 'settings', 'update')).toBe(false);
		expect(matrixAllows(m, 'admin', 'settings', 'read')).toBe(true);
		expect(matrixAllows(m, 'owner', 'settings', 'update')).toBe(true);
	});

	it('matris veya rol yoksa kapalı varsayar (yüklenirken kutular açılmasın)', () => {
		expect(matrixAllows(undefined, 'owner', 'settings', 'update')).toBe(false);
		expect(matrixAllows(null, 'owner', 'settings', 'update')).toBe(false);
		expect(matrixAllows(matrisKur(), undefined, 'settings', 'update')).toBe(false);
		expect(matrixAllows(matrisKur(), null, 'settings', 'update')).toBe(false);
	});

	it('bilinmeyen kaynak/eylem kapalı döner', () => {
		const m = matrisKur();
		expect(matrixAllows(m, 'readonly', 'api_keys', 'update')).toBe(false);
		expect(matrixAllows(m, 'agent', 'audit', 'read')).toBe(false);
	});
});
