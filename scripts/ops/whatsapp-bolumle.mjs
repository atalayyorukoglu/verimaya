/**
 * WhatsApp mesajlarını BÖLÜMLERE ayırır.
 *
 * Neden: mesajların %83'ü tek başına anlamsız ("Evet 31 dönüş", "grand park lara
 * resort 2 kişi 1 oda"). Bilgi tek mesajda değil, birbirini izleyen birkaç mesajda
 * duruyor — hasta adı birinde, fiyat ötekinde, otel üçüncüsünde. Modele mesaj değil
 * bölüm verilirse bağ kurulabiliyor (ölçüm: docs/NOT-whatsapp.md).
 *
 * Sınır kuralları — üçü de ekibin ZATEN yaptığı şeyden türetildi:
 *  1. Ayraç mesajı (`//////`, `=====`): ekip hastaları böyle ayırıyor.
 *  2. Zaman boşluğu: konuşma durur, sonraki konu yeni bölümdür.
 *  3. Üst sınır: bir bölüm modele sığmayacak kadar büyümesin.
 *
 *   node scripts/ops/whatsapp-bolumle.mjs <mesajlar.json> [--bosluk-dk 25] [--azami 40]
 */
import { readFileSync } from 'node:fs';

const SEPARATOR = /^[/=\-_.·•\s]{3,}$/;

/** Gövdesi olmayan (yalnız medya/sticker) ve dışa aktarım yer tutucuları. */
const PLACEHOLDER = /^(image|video|sticker|audio|document|GIF) omitted$|^This message was deleted\.$/i;

export function bolumle(messages, { boslukDk = 25, azami = 40 } = {}) {
	const bolumler = [];
	let current = [];

	const kapat = () => {
		// Yalnız ayraç/gürültüden ibaret bölümü atma; içinde hiç metin yoksa anlamsız.
		if (current.some((m) => (m.body ?? '').trim() && !PLACEHOLDER.test(m.body.trim()))) {
			bolumler.push(current);
		}
		current = [];
	};

	let prevTs = null;
	for (const m of messages) {
		const body = (m.body ?? '').trim();

		if (body && SEPARATOR.test(body)) {
			kapat();
			prevTs = m.timestamp;
			continue;
		}
		if (prevTs !== null && m.timestamp - prevTs > boslukDk * 60) kapat();
		if (current.length >= azami) kapat();

		current.push(m);
		prevTs = m.timestamp;
	}
	kapat();
	return bolumler;
}

const [file, ...rest] = process.argv.slice(2);
if (!file) {
	console.error('Kullanım: node whatsapp-bolumle.mjs <mesajlar.json> [--bosluk-dk N] [--azami N]');
	process.exit(1);
}
const arg = (name, def) => {
	const i = rest.indexOf(`--${name}`);
	return i >= 0 ? Number(rest[i + 1]) : def;
};
const messages = JSON.parse(readFileSync(file, 'utf8'));
const bolumler = bolumle(messages, { boslukDk: arg('bosluk-dk', 25), azami: arg('azami', 40) });

const boy = bolumler.map((b) => b.length).sort((a, b) => a - b);
process.stderr.write(
	`${messages.length} mesaj → ${bolumler.length} bölüm ` +
		`(ortanca ${boy[Math.floor(boy.length / 2)]}, en büyük ${boy.at(-1)})\n`
);
console.log(JSON.stringify(bolumler, null, 1));
