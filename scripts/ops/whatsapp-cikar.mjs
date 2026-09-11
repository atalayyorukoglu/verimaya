/**
 * Konuşma bölümlerinden hasta kaydı çıkarır — ÖLÇÜM amaçlı, canlıya yazmaz.
 *
 * Kullanım:
 *   node scripts/ops/whatsapp-cikar.mjs <bolumler.json> <kisiler.tsv> [--adet N] [--es-zaman 5]
 *
 * `kisiler.tsv`: "tip<TAB>ad" satırları (tip: Hasta / Otel / Personel ...).
 *
 * Üç ders, ilk denemeden:
 *  1. Yazan kişinin WhatsApp adı ("OrbisMed - 552-351-55-07") modele verilince
 *     model onu HASTANIN TELEFONU sandı — 5 kayıtta 5. Artık gönderen nötr
 *     etiketle ("Kişi 1") gösteriliyor; sıra bilgisi korunur, ad sızmaz.
 *  2. Otel fiyatı konuşulan bölümde model personeli hasta sandı. Çıkan ad artık
 *     kişi listesine karşı doğrulanıyor: Hasta tipinde biriyle eşleşmiyorsa
 *     "doğrulanmadı" damgası yer; eşleşme personel/otel ise kayıt DÜŞÜRÜLÜR.
 *  3. Serbest "not" alanı modelin kendi çıkarımlarıyla doluyordu; kısaltıldı.
 */
import { readFileSync } from 'node:fs';

const SISTEM = `Sağlık turizmi operasyonunda WhatsApp konuşmalarını kayda çeviriyorsun.
Sana bir KONUŞMA BÖLÜMÜ verilecek: arka arkaya yazılmış mesajlar. Bilgi tek mesajda
olmayabilir — hasta adı bir mesajda, fiyat başkasında, otel üçüncüsünde olabilir. Birleştir.

KURALLAR
- Yalnız metinde AÇIKÇA yazan bilgiyi çıkar. Tahmin etme, tamamlama, genişletme.
- Emin değilsen null bırak. Eksik kayıt, uydurma kayıttan iyidir.
- Hasta kaydı yoksa {"kayit_var": false}. Otel fiyatı sorma, ekip içi sohbet,
  selamlaşma, teşekkür = kayıt DEĞİL.
- "Kişi 1/2/3" konuşanlardır; onlar hasta DEĞİL, adlarını kullanma.
- Telefon/e-posta yalnız mesaj metninde açıkça yazıyorsa doldur.
- "not" en fazla 15 kelime; yalnız metinde yazan ek koşul (indirim, transfer dahil vb).

Yalnız JSON dön:
{"kayit_var":true|false,"hasta_adi":string|null,"tedavi":string|null,"tutar":string|null,
 "otel":string|null,"kisi_sayisi":string|null,"tarih":string|null,"telefon":string|null,
 "eposta":string|null,"not":string|null}`;

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const [bolumFile, kisiFile] = process.argv.slice(2);
const key = readFileSync('apps/api/.env', 'utf8').match(/^LLM_API_KEY=(.+)$/m)[1].trim();

/** Soyad → {tip, ad}. Soyad tek başına daha ayırt edici. */
const kisiler = new Map();
for (const line of readFileSync(kisiFile, 'utf8').split('\n')) {
	if (!line.includes('\t')) continue;
	const [tip, ad] = line.split('\t');
	const p = ad.trim().split(/\s+/);
	if (p.length >= 2 && p.at(-1).length >= 5) kisiler.set(p.at(-1).toLowerCase(), { tip, ad: ad.trim() });
}

const ZENGIN = [/\d[\d.,]*\s*(gbp|eur|euro|pound|tl|£|€)/i, /kron|crown|implant|zirkon|dolgu|sa[cç] ekimi|veneer/i,
	/otel|hotel|resort|suite/i, /[\w.+-]+@[\w-]+\.\w+|\+\d{10,}/];

const bolumler = JSON.parse(readFileSync(bolumFile, 'utf8'));
const zengin = bolumler.filter((b) => {
	const t = b.map((m) => m.body || '').join('\n');
	return t.length > 40 && ZENGIN.filter((r) => r.test(t)).length >= 2;
});

/** Gönderen adı içeriğe sızmasın: nötr, ama sıra korunsun. */
function metinle(bolum) {
	const kim = new Map();
	return bolum
		.map((m) => {
			if (!kim.has(m.participant)) kim.set(m.participant, `Kişi ${kim.size + 1}`);
			return `${kim.get(m.participant)}: ${m.body || '[medya]'}`;
		})
		.join('\n');
}

/** Çıkan adı kişi listesine karşı doğrula. */
function dogrula(ad) {
	if (!ad) return { durum: 'ad yok' };
	for (const w of ad.toLowerCase().split(/\s+/)) {
		const k = kisiler.get(w.replace(/[^\wçğıöşü']/g, ''));
		if (k) return k.tip === 'Hasta' ? { durum: 'hasta eşleşti', ad: k.ad } : { durum: `hasta değil (${k.tip})`, ad: k.ad };
	}
	return { durum: 'kayıtta yok' };
}

async function cikar(bolum, deneme = 0) {
	if (deneme > 5) return { metin: metinle(bolum), cikti: { hata: 'hız sınırı aşılamadı' } };
	const metin = metinle(bolum);
	const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
		body: JSON.stringify({ model: 'mistral-small-latest', temperature: 0,
			response_format: { type: 'json_object' },
			messages: [{ role: 'system', content: SISTEM }, { role: 'user', content: metin }] })
	});
	if (r.status === 429) {
		// Sağlayıcı hız sınırı. İlk denemede 462 bölümün 282'si buraya düştü;
		// sessizce "kayıt yok" saymak ölçümü çöpe çevirirdi.
		await new Promise((ok) => setTimeout(ok, 4000 + Math.random() * 4000));
		return cikar(bolum, deneme + 1);
	}
	if (!r.ok) return { metin, cikti: { hata: `http ${r.status}` } };
	const j = await r.json();
	try { return { metin, cikti: JSON.parse(j.choices[0].message.content) }; }
	catch { return { metin, cikti: { hata: 'json değil' } }; }
}

const adet = arg('adet', zengin.length);
const esZaman = arg('es-zaman', 5);
const hedef = zengin.slice(0, adet);
process.stderr.write(`${bolumler.length} bölüm → ${zengin.length} zengin → ${hedef.length} işlenecek\n`);

const sonuc = [];
for (let i = 0; i < hedef.length; i += esZaman) {
	const grup = await Promise.all(hedef.slice(i, i + esZaman).map(cikar));
	for (const g of grup) {
		g.dogrulama = g.cikti?.kayit_var ? dogrula(g.cikti.hasta_adi) : null;
		sonuc.push(g);
	}
	process.stderr.write(`\r  ${sonuc.length}/${hedef.length}`);
}
process.stderr.write('\n');
console.log(JSON.stringify(sonuc, null, 1));
