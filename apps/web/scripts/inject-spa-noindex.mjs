/**
 * adapter-static SPA fallback (`build/index.html`) does not render layout `<svelte:head>`.
 * Panel routes are served from this shell — inject noindex so crawlers see it without JS.
 * Also copy prerendered hub → hub.html for nginx marketing apex (`/`).
 *
 * Critical: /vitrin/ HTML uses relative `../_app/...` and hydrate node_ids for `/vitrin`.
 * Served at `/` that combination blanks the page (broken imports + wrong route hydrate).
 * Rewrite paths to absolute and start without hydrate so CSR matches `location.pathname`.
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
	out = out.replace(
		/base:\s*new URL\("\.\.",\s*location\)\.pathname\.slice\(0,\s*-1\)/g,
		'base: ""'
	);
	// Hydrate payload is for /vitrin nodes while URL is `/` — forces blank remount.
	// CSR from location so root +page can render HubHome on marketing host.
	out = out.replace(/kit\.start\(app,\s*element,\s*\{[\s\S]*?\}\);/, 'kit.start(app, element);');

	if (out.includes('../_app/')) {
		throw new Error('inject-spa-noindex: hub.html still has relative ../_app/ paths');
	}
	if (/kit\.start\(app,\s*element,\s*\{/.test(out)) {
		throw new Error('inject-spa-noindex: hub.html still passes hydrate options to kit.start');
	}
	return out;
}

if (existsSync(vitrin)) {
	const prepared = prepareHubHtml(readFileSync(vitrin, 'utf8'));
	writeFileSync(hub, prepared);
	console.log('inject-spa-noindex: wrote build/hub.html (absolute assets, CSR start)');
} else {
	console.warn('inject-spa-noindex: build/vitrin/index.html missing — hub.html not created');
}
