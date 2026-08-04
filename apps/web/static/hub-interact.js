/**
 * Progressive enhancement for marketing hub.html (static snapshot without SvelteKit client).
 * Hydrated routes keep Svelte handlers; this script no-ops harmlessly if re-injected.
 */
(function () {
	'use strict';

	if (window.__hubInteract) return;
	window.__hubInteract = true;

	var STORAGE_KEY = 'verimaya:theme';

	function isDark() {
		return document.documentElement.classList.contains('dark');
	}

	function applyTheme(theme) {
		var root = document.documentElement;
		var dark = theme === 'dark';
		root.classList.toggle('dark', dark);
		root.style.colorScheme = theme;
		try {
			localStorage.setItem(STORAGE_KEY, theme);
		} catch (_) {
			/* ignore quota / private mode */
		}
	}

	function toggleTheme() {
		applyTheme(isDark() ? 'light' : 'dark');
		document.querySelectorAll('[data-hub-theme-toggle]').forEach(function (btn) {
			var toLight = btn.getAttribute('data-label-to-light');
			var toDark = btn.getAttribute('data-label-to-dark');
			if (toLight && toDark) {
				btn.setAttribute('aria-label', isDark() ? toLight : toDark);
			}
		});
	}

	function setMenuOpen(open) {
		var nav = document.querySelector('[data-hub-mobile-nav]');
		var toggle = document.querySelector('[data-hub-menu-toggle]');
		var iconOpen = document.querySelector('[data-hub-menu-icon-open]');
		var iconClose = document.querySelector('[data-hub-menu-icon-close]');
		if (nav) {
			nav.classList.toggle('hidden', !open);
			nav.classList.toggle('flex', open);
		}
		if (toggle) {
			toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
			var openLabel = toggle.getAttribute('data-label-open');
			var closeLabel = toggle.getAttribute('data-label-close');
			if (openLabel && closeLabel) {
				toggle.setAttribute('aria-label', open ? closeLabel : openLabel);
			}
		}
		if (iconOpen) iconOpen.classList.toggle('hidden', open);
		if (iconClose) iconClose.classList.toggle('hidden', !open);
	}

	function isMenuOpen() {
		var nav = document.querySelector('[data-hub-mobile-nav]');
		return !!(nav && !nav.classList.contains('hidden'));
	}

	function panelForToggle(btn) {
		var scope = btn.parentElement;
		return scope ? scope.querySelector('[data-hub-login-panel]') : null;
	}

	function closeLoginPanels(except) {
		document.querySelectorAll('[data-hub-login-panel]').forEach(function (panel) {
			if (except && panel === except) return;
			panel.classList.add('hidden');
			if (panel.classList.contains('flex-col')) panel.classList.remove('flex');
		});
		document.querySelectorAll('[data-hub-login-toggle]').forEach(function (btn) {
			var related = panelForToggle(btn);
			btn.setAttribute(
				'aria-expanded',
				except && related === except ? 'true' : 'false'
			);
		});
	}

	document.addEventListener(
		'click',
		function (e) {
			var themeBtn = e.target.closest('[data-hub-theme-toggle]');
			if (themeBtn) {
				toggleTheme();
				return;
			}

			var menuBtn = e.target.closest('[data-hub-menu-toggle]');
			if (menuBtn) {
				setMenuOpen(!isMenuOpen());
				return;
			}

			var loginBtn = e.target.closest('[data-hub-login-toggle]');
			if (loginBtn) {
				e.stopPropagation();
				var panel = panelForToggle(loginBtn);
				if (!panel) return;
				var willOpen = panel.classList.contains('hidden');
				closeLoginPanels(willOpen ? panel : null);
				panel.classList.toggle('hidden', !willOpen);
				// Mobile panel uses flex when open; desktop dropdown is absolute (no flex).
				if (panel.classList.contains('flex-col')) {
					panel.classList.toggle('flex', willOpen);
				}
				loginBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
				return;
			}

			var navLink = e.target.closest('[data-hub-mobile-nav] a');
			if (navLink) {
				setMenuOpen(false);
				closeLoginPanels(null);
				return;
			}

			if (!e.target.closest('[data-hub-login-panel]') && !e.target.closest('[data-hub-login-toggle]')) {
				closeLoginPanels(null);
			}
		},
		false
	);
})();
