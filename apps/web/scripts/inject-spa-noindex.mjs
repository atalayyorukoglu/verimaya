/**
 * adapter-static SPA fallback (`build/index.html`) does not render layout `<svelte:head>`.
 * Panel routes are served from this shell — inject noindex so crawlers see it without JS.
 * Also copy prerendered hub → hub.html for nginx marketing apex (`/`).
 *
 * Critical: /vitrin/ HTML cannot be hydrated at `/` (wrong route + CSR remount blanks the
 * page). Serve hub as a static snapshot: absolute asset URLs, no SvelteKit client bootstrap.
 * Theme FOUC script in <head> stays; full SPA interactivity is on app.* / other routes.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fallback = join(root, 'build/index.html');
const vitrin = join(root, 'build/vitrin/index.html');
const hub = join(root, 'build/hub.html');

if (!existsSync(fallback)) {
	console.error('inject-spa-noindex: build/index.html missing — run vite build first');
	process.exit(1);
}

let html = readFileSync(fallback, 'utf8');
if (!html.includes('name="robots"')) {
	if (!html.includes('</head>')) {
		console.error('inject-spa-noindex: </head> not found');
		process.exit(1);
	}
	const tag = '\t\t<meta name="robots" content="noindex" />\n';
	html = html.replace('</head>', `${tag}</head>`);
	writeFileSync(fallback, html);
	console.log('inject-spa-noindex: wrote noindex into build/index.html');
} else {
	console.log('inject-spa-noindex: robots meta already present, skip');
}

/**
 * @param {string} raw
 * @returns {string}
 */
function prepareHubHtml(raw) {
	let out = raw;
	// /vitrin/ depth → relative assets; hub is served at document `/`.
	out = out.replaceAll('../_app/', '/_app/');

	// Drop SvelteKit client —kit.start (with or without hydrate) remounts `/` and
	// tears down the prerendered marketing DOM → blank apex.
	out = out.replace(/<script>\s*\{\s*__sveltekit_[\s\S]*?<\/script>/, '');

	// JS modulepreloads are unused without the client; keep CSS + icon absolute.
	out = out.replace(/\s*<link rel="modulepreload"[^>]*>/g, '');

	if (out.includes('../_app/')) {
		throw new Error('inject-spa-noindex: hub.html still has relative ../_app/ paths');
	}
	if (out.includes('__sveltekit_') || out.includes('kit.start(')) {
		throw new Error('inject-spa-noindex: hub.html still contains SvelteKit client bootstrap');
	}
	if (!out.includes('hub-page')) {
		throw new Error('inject-spa-noindex: hub.html missing hub-page markup');
	}
	return out;
}

if (existsSync(vitrin)) {
	const prepared = prepareHubHtml(readFileSync(vitrin, 'utf8'));
	writeFileSync(hub, prepared);
	console.log('inject-spa-noindex: wrote build/hub.html (static snapshot, no client)');
} else {
	console.warn('inject-spa-noindex: build/vitrin/index.html missing — hub.html not created');
}
