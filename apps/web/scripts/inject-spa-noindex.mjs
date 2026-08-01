/**
 * adapter-static SPA fallback (`build/index.html`) does not render layout `<svelte:head>`.
 * Panel routes are served from this shell — inject noindex so crawlers see it without JS.
 * Also copy prerendered hub → hub.html for nginx marketing apex (`/`).
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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

if (existsSync(vitrin)) {
	copyFileSync(vitrin, hub);
	console.log('inject-spa-noindex: copied build/vitrin/index.html → build/hub.html');
} else {
	console.warn('inject-spa-noindex: build/vitrin/index.html missing — hub.html not created');
}
