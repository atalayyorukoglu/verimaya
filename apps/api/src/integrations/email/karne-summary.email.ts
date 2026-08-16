import type { KarneLeadSummary } from '../../karne/karne.schemas';

const TOTAL_SCORED = 10;
const SITE = 'https://verimaya.com';

export function buildKarneSummaryEmail(summary: KarneLeadSummary): {
	subject: string;
	text: string;
	html: string;
} {
	const subject = 'Yapay zeka karnesi özetiniz — Verimaya';
	const headline = `${TOTAL_SCORED} sorudan ${summary.zero_count}'inde kanıtınız yok.`;

	const weakLines =
		summary.top_weak.length > 0
			? summary.top_weak.map((w, i) => `${i + 1}. ${w}`).join('\n')
			: 'Bu turda zayıf alan öne çıkmadı.';

	const strongLines =
		summary.strong_titles.length > 0
			? summary.strong_titles.map((t) => `• ${t}`).join('\n')
			: 'Güçlü alan işaretlenmedi.';

	const euBlock = summary.eu_exposure
		? '\n\nAB / İngiltere maruziyeti belirttiniz: Avrupa yapay zeka kuralları (EU AI Act) takvimi klinikler için kritik olabilir — zayıf alanlara öncelik verin.\n'
		: '';

	const text = [
		'Merhaba,',
		'',
		'Ücretsiz yapay zeka karnesi özetiniz:',
		'',
		headline,
		'',
		'Öncelikli boşluklar:',
		weakLines,
		'',
		'Güçlü görünen alanlar:',
		strongLines,
		euBlock,
		`Karneni yeniden doldur: ${SITE}/yapay-zeka-karnesi/`,
		`Verimaya: ${SITE}/`,
		'',
		'Bu e-posta, karnede girdiğiniz adres ve açık rızanızla gönderildi.'
	]
		.filter((line) => line !== undefined)
		.join('\n');

	const weakHtml =
		summary.top_weak.length > 0
			? `<ol>${summary.top_weak.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ol>`
			: '<p>Bu turda zayıf alan öne çıkmadı.</p>';

	const strongHtml =
		summary.strong_titles.length > 0
			? `<ul>${summary.strong_titles.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
			: '<p>Güçlü alan işaretlenmedi.</p>';

	const euHtml = summary.eu_exposure
		? `<p style="margin-top:1.25rem">AB / İngiltere maruziyeti belirttiniz: Avrupa yapay zeka kuralları (EU AI Act) takvimi klinikler için kritik olabilir — zayıf alanlara öncelik verin.</p>`
		: '';

	const html = `<!DOCTYPE html>
<html lang="tr"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a19;max-width:36rem;margin:0 auto;padding:1.5rem">
  <p>Merhaba,</p>
  <p>Ücretsiz yapay zeka karnesi özetiniz:</p>
  <p style="font-size:1.125rem;font-weight:600">${escapeHtml(headline)}</p>
  <p style="font-weight:600;margin-bottom:0.25rem">Öncelikli boşluklar</p>
  ${weakHtml}
  <p style="font-weight:600;margin-bottom:0.25rem">Güçlü görünen alanlar</p>
  ${strongHtml}
  ${euHtml}
  <p style="margin-top:1.5rem">
    <a href="${SITE}/yapay-zeka-karnesi/">Karneni yeniden doldur</a>
    · <a href="${SITE}/">Verimaya</a>
  </p>
  <p style="font-size:0.875rem;color:#6e6e6b">Bu e-posta, karnede girdiğiniz adres ve açık rızanızla gönderildi.</p>
</body></html>`;

	return { subject, text, html };
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
