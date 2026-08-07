/**
 * adapter-static SPA fallback (`build/index.html`) does not render layout `<svelte:head>`.
 * Panel routes are served from this shell — inject noindex so crawlers see it without JS.
 * Also copy prerendered hub → hub.html for nginx marketing apex (`/`).
 *
 * Critical: /vitrin/ HTML cannot be hydrated at `/` (wrong route + CSR remount blanks the
 * page). Serve hub as a static snapshot: absolute asset URLs, no SvelteKit client bootstrap.
 * Theme FOUC script in <head> stays; inject `/hub-interact.js` for theme/menu/login
 * progressive enhancement (Svelte onclick never binds without kit.start). Full SPA
 * interactivity remains on app.* / other hydrated routes.
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

	// Progressive enhancement when SvelteKit client is stripped (theme/menu/login/locale).
	// Content-hash query busts Cloudflare/browser cache when hub-interact.js changes
	// (apex Hub HTML updates earlier than the long-lived .js edge cache otherwise).
	const interactPath = join(root, 'static/hub-interact.js');
	if (!existsSync(interactPath)) {
		throw new Error('inject-spa-noindex: static/hub-interact.js missing');
	}
	const interactHash = createHash('sha256')
		.update(readFileSync(interactPath))
		.digest('hex')
		.slice(0, 12);
	const hubInteract = `<script src="/hub-interact.js?h=${interactHash}" defer></script>`;
	if (!out.includes('/hub-interact.js')) {
		if (!out.includes('</body>')) {
			throw new Error('inject-spa-noindex: hub.html missing </body> for hub-interact.js inject');
		}
		out = out.replace('</body>', `${hubInteract}\n</body>`);
	} else {
		out = out.replace(/\/hub-interact\.js(?:\?[^"']*)?/g, `/hub-interact.js?h=${interactHash}`);
	}

	return out;
}

/**
 * hub.html is served with a hash-pinned `script-src` CSP (nginx.conf, `/hub.html`
 * location) instead of `'unsafe-inline'`, so an injected inline `<script>` can't
 * execute. Sync nginx.conf hashes to the actual hub.html scripts at build time
 * (JSON-LD content depends on PUBLIC_SITE_URL etc.) — then copy that nginx.conf
 * from the Docker build stage into the final image.
 * @param {string} html
 */
function syncCspHashes(html) {
	if (!existsSync(nginxConf)) {
		throw new Error('inject-spa-noindex: nginx.conf missing — cannot sync CSP script hashes');
	}
	// Only pin inline scripts (theme FOUC + JSON-LD). External hub-interact.js uses
	// script-src 'self' and must not produce an empty-body hash.
	const scripts = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)]
		.filter((m) => {
			const attrs = m[1] ?? '';
			if (/\bsrc\s*=/.test(attrs)) return false;
			return m[2].trim().length > 0;
		})
		.map((m) => m[2]);
	if (scripts.length === 0) {
		throw new Error('inject-spa-noindex: hub.html has no inline <script> blocks — expected 2');
	}
	const hashList = scripts.map(
		(s) => `sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}`
	);
	const hashClause = hashList.map((h) => `'${h}'`).join(' ');

	const conf = readFileSync(nginxConf, 'utf8');
	if (!/location = \/hub\.html \{/.test(conf)) {
		throw new Error('inject-spa-noindex: nginx.conf has no `location = /hub.html` block');
	}
	const updated = conf.replace(
		/(location = \/hub\.html \{[\s\S]*?script-src 'self')(?: '[^']+')*/,
		`$1 ${hashClause}`
	);
	if (updated === conf && !hashList.every((h) => conf.includes(h))) {
		throw new Error(
			'inject-spa-noindex: failed to rewrite hub.html CSP script-src hashes in nginx.conf'
		);
	}
	writeFileSync(nginxConf, updated);
	console.log(
		`inject-spa-noindex: synced hub.html CSP hashes → nginx.conf (${hashList.join(', ')})`
	);
}

if (existsSync(vitrin)) {
	const prepared = prepareHubHtml(readFileSync(vitrin, 'utf8'));
	syncCspHashes(prepared);
	writeFileSync(hub, prepared);
	console.log('inject-spa-noindex: wrote build/hub.html (static snapshot, no client)');
} else {
	console.warn('inject-spa-noindex: build/vitrin/index.html missing — hub.html not created');
}
