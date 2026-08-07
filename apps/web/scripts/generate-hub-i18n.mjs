/**
 * Embed hub/locale/theme message subset into static/hub-interact.js.
 * Apex hub.html has no SvelteKit client — progressive enhancement needs a vanilla catalog.
 *
 * Source of truth remains src/lib/i18n/messages.ts (tr tip kaynağı).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const interactPath = join(root, 'static/hub-interact.js');
const messagesUrl = pathToFileURL(join(root, 'src/lib/i18n/messages.ts')).href;

const { messages } = await import(messagesUrl);

/** @param {string} key */
function includeKey(key) {
	return (
		key.startsWith('hub.') ||
		key.startsWith('locale.') ||
		key.startsWith('theme.') ||
		key === 'nav.features' ||
		key === 'nav.changelog'
	);
}

/** @param {Record<string, string>} catalog */
function pick(catalog) {
	/** @type {Record<string, string>} */
	const out = {};
	for (const key of Object.keys(catalog)) {
		if (includeKey(key)) out[key] = catalog[key];
	}
	return out;
}

const payload = {
	tr: pick(messages.tr),
	en: pick(messages.en)
};

const trKeys = Object.keys(payload.tr).sort();
const enKeys = Object.keys(payload.en).sort();
const missingEn = trKeys.filter((k) => !(k in payload.en));
const missingTr = enKeys.filter((k) => !(k in payload.tr));
if (missingEn.length || missingTr.length) {
	throw new Error(
		`generate-hub-i18n: catalog mismatch — missing en: ${missingEn.join(', ') || '—'}; missing tr: ${missingTr.join(', ') || '—'}`
	);
}

const begin = '/* <hub-i18n-messages> */';
const end = '/* </hub-i18n-messages> */';
const block = `${begin}
	var HUB_I18N = ${JSON.stringify(payload)};
	${end}`;

const src = readFileSync(interactPath, 'utf8');
if (!src.includes(begin) || !src.includes(end)) {
	throw new Error('generate-hub-i18n: hub-interact.js missing <hub-i18n-messages> markers');
}

const updated = src.replace(
	new RegExp(
		`${begin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
	),
	block
);
if (updated === src && !src.includes('"hub.nav.webApp"')) {
	throw new Error('generate-hub-i18n: failed to rewrite HUB_I18N block');
}

writeFileSync(interactPath, updated);
console.log(`generate-hub-i18n: wrote ${trKeys.length} keys × 2 locales → static/hub-interact.js`);
