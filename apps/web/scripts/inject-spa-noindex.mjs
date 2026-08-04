/**
 * adapter-static SPA fallback (`build/index.html`) does not render layout `<svelte:head>`.
 * Panel routes are served from this shell — inject noindex so crawlers see it without JS.
 * Also copy prerendered hub → hub.html for nginx marketing apex (`/`).
 *
 * Critical: /vitrin/ HTML cannot be hydrated at `/` (wrong route + CSR remount blanks the
 * page). Serve hub as a static snapshot: absolute asset URLs, no SvelteKit client bootstrap.
 * Theme FOUC script in <head> stays; full SPA interactivity is on app.* / other routes.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fallback = join(root, 'build/index.html');
const vitrin = join(root, 'build/vitrin/index.html');
const hub = join(root, 'build/hub.html');
const nginxConf = join(root, 'nginx.conf');

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

	// JS modulepreloads are unused without the client; keep CSS + icon.
	// SvelteKit emits `href` before `rel`, so match either attribute order.
	out = out.replace(/\s*<link\b[^>]*\brel="modulepreload"[^>]*>/g, '');

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

/**
 * hub.html is served with a hash-pinned `script-src` CSP (nginx.conf, `/hub.html`
 * location) instead of `'unsafe-inline'`, so an injected inline `<script>` can't
 * execute. That only works if the CSP's hashes stay in sync with hub.html's actual
 * inline script content. Fail the build loudly rather than silently shipping a CSP
 * that blocks the legitimate theme/JSON-LD scripts (or, if hashes were dropped
 * instead of updated, silently falls back to allowing arbitrary inline JS).
 * @param {string} html
 */
function verifyCspHashes(html) {
	if (!existsSync(nginxConf)) {
		throw new Error('inject-spa-noindex: nginx.conf missing — cannot verify CSP script hashes');
	}
	const scripts = [...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
	if (scripts.length === 0) {
		throw new Error('inject-spa-noindex: hub.html has no inline <script> blocks — expected 2');
	}
	const actualHashes = new Set(
		scripts.map((s) => `sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}`)
	);

	const conf = readFileSync(nginxConf, 'utf8');
	const hubBlockMatch = conf.match(/location = \/hub\.html \{[\s\S]*?\}/);
	if (!hubBlockMatch) {
		throw new Error('inject-spa-noindex: nginx.conf has no `location = /hub.html` block');
	}
	const confHashes = new Set([...hubBlockMatch[0].matchAll(/'(sha256-[^']+)'/g)].map((m) => m[1]));

	const missingFromConf = [...actualHashes].filter((h) => !confHashes.has(h));
	if (missingFromConf.length > 0) {
		throw new Error(
			'inject-spa-noindex: hub.html inline script hash(es) not present in nginx.conf CSP — ' +
				'a theme/JSON-LD script changed without updating the hash, so the browser will block it ' +
				`(or worse, someone widened the CSP back to 'unsafe-inline'). Recompute and update ` +
				`nginx.conf's \`location = /hub.html\` script-src. Missing: ${missingFromConf.join(', ')}`
		);
	}
}

if (existsSync(vitrin)) {
	const prepared = prepareHubHtml(readFileSync(vitrin, 'utf8'));
	verifyCspHashes(prepared);
	writeFileSync(hub, prepared);
	console.log('inject-spa-noindex: wrote build/hub.html (static snapshot, no client)');
	console.log('inject-spa-noindex: hub.html inline script hashes verified against nginx.conf CSP');
} else {
	console.warn('inject-spa-noindex: build/vitrin/index.html missing — hub.html not created');
}
