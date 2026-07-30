/**
 * adapter-static SPA fallback (`build/index.html`) does not render layout `<svelte:head>`.
 * Panel routes are served from this shell — inject noindex so crawlers see it without JS.
 * Prerendered public pages (e.g. build/vitrin/index.html) are left untouched.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fallback = join(root, 'build/index.html');

if (!existsSync(fallback)) {
	console.error('inject-spa-noindex: build/index.html missing — run vite build first');
	process.exit(1);
}

let html = readFileSync(fallback, 'utf8');
if (html.includes('name="robots"')) {
	console.log('inject-spa-noindex: robots meta already present, skip');
	process.exit(0);
}

const tag = '\t\t<meta name="robots" content="noindex" />\n';
if (!html.includes('</head>')) {
	console.error('inject-spa-noindex: </head> not found');
	process.exit(1);
}

html = html.replace('</head>', `${tag}</head>`);
writeFileSync(fallback, html);
console.log('inject-spa-noindex: wrote noindex into build/index.html');
