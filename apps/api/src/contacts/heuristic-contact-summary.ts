import type {
	ContactSummaryContext,
	ContactSummaryItem,
	ContactSummarySentenceDraft
} from '../integrations/llm/llm.types';

/**
 * LLM yokken (ya da model yazamayınca) kural tabanlı özet. Cümleler yalnız
 * sayı ve tarihten kurulur; metin yorumlanmaz — yorum modelin işi. Her cümle
 * dayandığı kayıtların ref'lerini taşır, arayüz aynı şekilde gösterir.
 */
function tarih(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
	return new Intl.DateTimeFormat('tr-TR', {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(d);
}

function sirali(items: ContactSummaryItem[]): ContactSummaryItem[] {
	return [...items].sort((a, b) => a.at.localeCompare(b.at));
}

export function heuristicSummarizeContact(
	ctx: ContactSummaryContext
): ContactSummarySentenceDraft[] {
	const items = sirali(ctx.items);
	if (items.length === 0) return [];
	const out: ContactSummarySentenceDraft[] = [];

	const ilk = items[0];
	const son = items[items.length - 1];
	out.push({
		text: `İlk kayıt ${tarih(ilk.at)}, son kayıt ${tarih(son.at)}; toplam ${items.length} kayıt.`,
		refs: [ilk.ref, son.ref]
	});

	const randevular = items.filter((i) => i.kind === 'appointment');
	if (randevular.length > 0) {
		const sonR = randevular[randevular.length - 1];
		out.push({
			text: `${randevular.length} randevu; sonuncusu ${tarih(sonR.at)}.`,
			refs: randevular.slice(-3).map((r) => r.ref)
		});
	}

	const islemler = items.filter((i) => i.kind === 'transaction');
	if (islemler.length > 0) {
		out.push({
			text: `${islemler.length} para işlemi; sonuncusu ${tarih(islemler[islemler.length - 1].at)}.`,
			refs: islemler.slice(-3).map((r) => r.ref)
		});
	}

	const mesajlar = items.filter((i) => i.kind === 'whatsapp');
	if (mesajlar.length > 0) {
		out.push({
			text: `WhatsApp gruplarında ${mesajlar.length} mesajda adı geçti; sonuncusu ${tarih(mesajlar[mesajlar.length - 1].at)}.`,
			refs: mesajlar.slice(-3).map((r) => r.ref)
		});
	}

	const notlar = items.filter((i) => i.kind === 'note');
	if (notlar.length > 0) {
		out.push({
			text: `${notlar.length} çalışan notu var.`,
			refs: notlar.slice(-3).map((r) => r.ref)
		});
	}

	return out;
}
