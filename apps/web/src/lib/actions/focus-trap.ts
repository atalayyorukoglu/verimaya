const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		(el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null
	);
}

export type FocusTrapOptions = {
	restoreFocus?: boolean;
	returnFocusTo?: HTMLElement | null;
};

/** Traps Tab/Shift+Tab within `node`; restores focus on destroy. */
export function focusTrap(node: HTMLElement, options: FocusTrapOptions = {}) {
	const { restoreFocus = true, returnFocusTo } = options;
	const previouslyFocused = returnFocusTo ?? (document.activeElement as HTMLElement | null);

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Tab') return;

		const focusable = getFocusableElements(node);
		if (focusable.length === 0) {
			e.preventDefault();
			node.focus();
			return;
		}

		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const active = document.activeElement as HTMLElement | null;

		if (e.shiftKey) {
			if (active === first || active === node || !node.contains(active)) {
				e.preventDefault();
				last.focus();
			}
		} else if (active === last) {
			e.preventDefault();
			first.focus();
		}
	}

	node.addEventListener('keydown', onKeydown);

	const focusable = getFocusableElements(node);
	if (focusable.length > 0) {
		focusable[0].focus();
	} else if (node.tabIndex >= 0 || node.getAttribute('tabindex') === '-1') {
		node.focus();
	}

	return {
		destroy() {
			node.removeEventListener('keydown', onKeydown);
			if (restoreFocus && previouslyFocused?.focus) {
				previouslyFocused.focus();
			}
		}
	};
}
