import { describe, expect, it } from 'vitest';
import {
	DEV_PANEL_HREF,
	filterDevPanelNavItems,
	isDevPanelEnabled,
	isDevPanelPath,
	resolveDevPanelRoute
} from './dev-panel';

describe('GAP-28 dev panel gate', () => {
	describe('isDevPanelEnabled', () => {
		it('is false when PUBLIC_USE_MSW is off (real API / production bake)', () => {
			expect(isDevPanelEnabled(false, true)).toBe(false);
			expect(isDevPanelEnabled(false, false)).toBe(false);
		});

		it('is false when Vite DEV is off even if MSW flag is true', () => {
			expect(isDevPanelEnabled(true, false)).toBe(false);
		});

		it('is true only when MSW is on and running under Vite DEV', () => {
			expect(isDevPanelEnabled(true, true)).toBe(true);
		});
	});

	describe('canAccessPlatformPanel', () => {
		it('allows platform admin without MSW', async () => {
			const { canAccessPlatformPanel } = await import('./dev-panel');
			expect(canAccessPlatformPanel(true, false)).toBe(true);
			expect(canAccessPlatformPanel(false, true)).toBe(true);
			expect(canAccessPlatformPanel(false, false)).toBe(false);
		});
	});

	describe('filterDevPanelNavItems (sidebar / Sistem → Platform)', () => {
		const items = [
			{ href: '/toolkit', labelKey: 'nav.tools' },
			{ href: '/settings', labelKey: 'nav.settings' },
			{ href: DEV_PANEL_HREF, labelKey: 'nav.developer' }
		];

		it('hides Platform when the flag is off', () => {
			const filtered = filterDevPanelNavItems(items, false);
			expect(filtered.map((i) => i.href)).toEqual(['/toolkit', '/settings']);
			expect(filtered.some((i) => i.href === DEV_PANEL_HREF)).toBe(false);
		});

		it('keeps Platform when the flag is on', () => {
			const filtered = filterDevPanelNavItems(items, true);
			expect(filtered.map((i) => i.href)).toEqual(['/toolkit', '/settings', DEV_PANEL_HREF]);
		});
	});

	describe('resolveDevPanelRoute (direct /dev visit)', () => {
		it('redirects to panel home when the flag is off', () => {
			expect(resolveDevPanelRoute(false)).toEqual({ action: 'redirect', to: '/' });
		});

		it('allows the page when the flag is on', () => {
			expect(resolveDevPanelRoute(true)).toEqual({ action: 'allow' });
		});
	});

	describe('isDevPanelPath', () => {
		it('matches /dev and nested paths only', () => {
			expect(isDevPanelPath('/dev')).toBe(true);
			expect(isDevPanelPath('/dev/')).toBe(true);
			expect(isDevPanelPath('/developers')).toBe(false);
			expect(isDevPanelPath('/settings')).toBe(false);
		});
	});
});
