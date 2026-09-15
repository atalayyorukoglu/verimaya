import { describe, expect, it } from 'vitest';
import { sadelestir, turleriBul } from './mesaj-turu';

/**
 * Örneklerin çoğu gerçek gruplardan: şapkasız, noktalama düzensiz, tek satır.
 * Testi sadeleştirmek için düzeltilmedi — ayrıştırıcının görmesi gereken metin bu.
 */
describe('sadelestir', () => {
	it('Türkçe küçük harf kuralını uygular (I→ı, İ→i)', () => {
		expect(sadelestir('İSTANBUL')).toBe('istanbul');
		expect(sadelestir('IŞIK')).toBe('isik');
	});

	it('şapkalı ile şapkasız aynı yere düşer', () => {
		expect(sadelestir('Ödeme yapıldı')).toBe(sadelestir('Odeme yapildi'));
	});
});

describe('turleriBul — para', () => {
	it('tutar + para birimi parayı belli eder', () => {
		const s = turleriBul('Tnc ye 129.000 tl Aynur Tasman isimli hastanin odemesi yapildi.');
		expect(s.turler).toContain('finance');
	});

	it('şapkasız fiil de yakalanır', () => {
		expect(turleriBul('Pound hesabina 600 gbp yatirildi.').turler).toEqual(['finance']);
	});

	it('çıplak sayı para değildir', () => {
		const s = turleriBul('grand park lara resort 2 kişi 1 oda');
		expect(s.turler).not.toContain('finance');
	});
});

describe('turleriBul — randevu', () => {
	it('randevu sözü + tarih', () => {
		const s = turleriBul('Deniz Korkmaz randevusunu 2026-09-15 14:00 tarihine alalim');
		expect(s.turler).toEqual(['appointment']);
		expect(s.isaretler).toContain('randevusunu');
	});

	it('tarihsiz randevu sözü de sayılır', () => {
		expect(turleriBul('Hastanin randevusu iptal').turler).toContain('appointment');
	});

	it('tarih TEK BAŞINA randevu saymaz', () => {
		// Ödeme tarihi taşıyan finans mesajı yanlışlıkla randevu olmamalı.
		const s = turleriBul('600 gbp 15.09 tarihinde yatirildi');
		expect(s.turler).toEqual(['finance']);
	});
});

describe('turleriBul — kişi/lojistik', () => {
	it('otel bilgisi kişi güncellemesidir', () => {
		expect(turleriBul('Dawit Abraham Alp paşa hotel').turler).toEqual(['contact']);
	});

	it('transfer ve uçuş da lojistiktir', () => {
		expect(turleriBul('Hasta 2 ekimde saat 12 de havalimanina birakilacak').turler).toContain(
			'contact'
		);
	});
});

describe('turleriBul — birden fazla tür', () => {
	it('aynı mesaj hem para hem randevu olabilir', () => {
		const s = turleriBul('Deniz Korkmaz randevusunu 15.09 14:00 e alalim, 100 GBP odeme alindi');
		expect(s.turler).toEqual(['finance', 'appointment']);
	});

	it('sıra sabittir: para, randevu, kişi', () => {
		const s = turleriBul('randevu icin otel ayarlandi, 500 tl kapora odendi');
		expect(s.turler).toEqual(['finance', 'appointment', 'contact']);
	});
});

describe('turleriBul — grubun görevi', () => {
	it('ignore grubunda hiç bakılmaz', () => {
		expect(turleriBul('600 gbp yatirildi', 'ignore').turler).toEqual([]);
	});

	it('işaret yoksa para grubunda para sayılır', () => {
		expect(turleriBul('Evet 31 dönüş', 'finance').turler).toEqual(['finance']);
	});

	it('işaret yoksa operasyon grubunda kişi sayılır', () => {
		expect(turleriBul('Evet 31 dönüş', 'operations').turler).toEqual(['contact']);
	});

	it('karışık grupta tahmin yürütülmez', () => {
		expect(turleriBul('Evet 31 dönüş', 'mixed').turler).toEqual([]);
	});

	it('metindeki açık işaret grubun görevini ezer', () => {
		// Muhasebe grubuna da otel yazılıyor; grup "para" diye otel bilgisi kaybolmasın.
		const s = turleriBul('Dawit Abraham Alp paşa hotel', 'finance');
		expect(s.turler).toEqual(['contact']);
	});

	it('boş gövde hiçbir tür üretmez', () => {
		expect(turleriBul(null, 'finance').turler).toEqual([]);
		expect(turleriBul('   ', 'finance').turler).toEqual([]);
	});
});
