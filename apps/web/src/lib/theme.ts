const STORAGE_KEY = 'verimaya:theme';

export type Theme = 'light' | 'dark';

export function getStoredTheme(): Theme {
	if (typeof localStorage === 'undefined') return 'light';
	const raw = localStorage.getItem(STORAGE_KEY);
	return raw === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	root.classList.toggle('dark', theme === 'dark');
	root.style.colorScheme = theme;
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, theme);
	}
}

export function toggleTheme(): Theme {
	const next: Theme = getStoredTheme() === 'dark' ? 'light' : 'dark';
	applyTheme(next);
	return next;
}

export function initTheme(): Theme {
	const theme = getStoredTheme();
	applyTheme(theme);
	return theme;
}
