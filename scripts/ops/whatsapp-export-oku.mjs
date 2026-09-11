/**
 * WhatsApp "Sohbeti dışa aktar" metnini, canlı hattan (WAHA) gelen mesajlarla
 * AYNI biçime çevirir.
 *
 * Neden gerekli: WhatsApp yeni bağlanan cihaza, gruba katılmadan önceki mesajları
 * VERMEZ. Numara bir gruba bugün eklendiyse geçmişi hattan hiç gelmez; tek yol eski
 * bir üyenin telefonundan dışa aktarması. Bu betik o metni tek biçime getirir ki
 * ayrıştırma kuralları canlı ve geçmiş veride aynı şekilde denenebilsin.
 *
 *   node scripts/ops/whatsapp-export-oku.mjs "<klasör>" > cikti.json
 *
 * Klasör, WhatsApp'ın ürettiği "WhatsApp Chat - <ad>" klasörüdür (`_chat.txt` içerir).
 *
 * ÇIKTI hasta adı, tedavi ve fiyat içerir — depoya KOYMAYIN (.gitignore'da ağ var).
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

/** `[GG/AA/YYYY, SS:DD:SS] Gönderen: gövde` — satır başı yalnız burada olur. */
const HEADER = /^‎?\[(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})\]\s([^:]+):\s?([\s\S]*)$/;

/** `<attached: dosya.jpg>` → medya; gövdeden çıkarılır, ad ayrı alanda durur. */
const ATTACHED = /‎?<attached:\s*([^>]+)>/;

/**
 * Sistem satırları (şifreleme uyarısı, "X added you", "created this group").
 * Gönderen alanı grup adının kendisi olduğunda WhatsApp sistem mesajı yazıyor.
 */
function isSystemLine(sender, body, chatName) {
	if (sender === chatName) return true;
	return /‎(created this group|added you|added |left$|changed the subject)/.test(body);
}

export function parseExport(text, chatName) {
	const out = [];
	let current = null;

	const flush = () => {
		if (!current) return;
		const raw = current.bodyLines.join('\n');
		const media = ATTACHED.exec(raw);
		const body = raw.replace(ATTACHED, '').replace(/‎/g, '').trim();
		if (!isSystemLine(current.sender, raw, chatName)) {
			out.push({
				timestamp: current.timestamp,
				participant: current.sender,
				body,
				hasMedia: Boolean(media),
				mediaName: media ? media[1] : null,
				fromExport: true
			});
		}
		current = null;
	};

	for (const line of text.split('\n')) {
		const m = HEADER.exec(line);
		if (m) {
			flush();
			const [, dd, mm, yyyy, hh, mi, ss, sender, rest] = m;
			// Dışa aktarım yerel saatle yazılır; saat dilimi bilgisi yok.
			const at = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`);
			current = {
				timestamp: Math.floor(at.getTime() / 1000),
				sender: sender.trim(),
				bodyLines: [rest]
			};
		} else if (current) {
			current.bodyLines.push(line);
		}
	}
	flush();
	return out;
}

const dir = process.argv[2];
if (!dir) {
	console.error('Kullanım: node whatsapp-export-oku.mjs "<WhatsApp Chat - ... klasörü>"');
	process.exit(1);
}
const chatName = basename(dir).replace(/^WhatsApp Chat - /, '');
const text = readFileSync(join(dir, '_chat.txt'), 'utf8');
const messages = parseExport(text, chatName);
process.stderr.write(`${chatName}: ${messages.length} mesaj\n`);
console.log(JSON.stringify(messages, null, 1));
