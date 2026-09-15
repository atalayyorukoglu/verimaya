import { describe, expect, it } from 'vitest';
import {
	descriptionSlug,
	driveFileNameFor,
	extensionFor,
	folderNameFor,
	slugify,
	tenantStamp,
	toAscii
} from './drive-names';

describe('DRIVE-01 ad kuralları', () => {
	it('Türkçe karakterleri ASCII yapar', () => {
		expect(toAscii('Şükrü Çağdaş İğne Öz')).toBe('Sukru Cagdas Igne Oz');
		expect(slugify('Uçuş bileti — İstanbul')).toBe('ucus-bileti-istanbul');
	});

	it('klasör adı kişi adıdır; Drive’ın sevmediği karakterler atılır', () => {
		expect(folderNameFor('Ayşe / Yılmaz')).toBe('Ayse Yilmaz');
		expect(folderNameFor('   ')).toBe('isimsiz-kisi');
	});

	it('uzantı mime’dan, yoksa dosya adından gelir', () => {
		expect(extensionFor('image/jpeg', null)).toBe('jpg');
		expect(extensionFor('application/pdf', null)).toBe('pdf');
		expect(extensionFor('application/octet-stream', 'rapor.DOCX')).toBe('docx');
		expect(extensionFor('application/octet-stream', null)).toBe('bin');
	});

	it('açıklama yoksa tür etiketi kullanılır', () => {
		expect(descriptionSlug(null, 'image/png')).toBe('whatsapp-gorsel');
		expect(descriptionSlug('   ', 'application/pdf')).toBe('whatsapp-belge');
	});

	it('açıklama ilk 60 karakterle sınırlı', () => {
		const uzun = 'a'.repeat(80);
		expect(descriptionSlug(uzun, 'image/png')).toBe('a'.repeat(60));
	});

	it('zaman damgası tenant saat dilimindedir (UTC gece yarısı kaymasın)', () => {
		// 2026-03-01T22:30:00Z → Istanbul'da 2 Mart 01:30.
		const at = new Date('2026-03-01T22:30:00.000Z');
		expect(tenantStamp(at, 'Europe/Istanbul')).toBe('2026-03-02-0130');
		expect(tenantStamp(at, 'UTC')).toBe('2026-03-01-2230');
	});

	it('gece yarısı 24 değil 00 yazar', () => {
		const at = new Date('2026-03-01T21:00:00.000Z');
		expect(tenantStamp(at, 'Europe/Istanbul')).toBe('2026-03-02-0000');
	});

	it('tam dosya adı: tarih-saat-açıklama.uzantı', () => {
		expect(
			driveFileNameFor({
				at: new Date('2026-09-15T08:05:00.000Z'),
				timezone: 'Europe/Istanbul',
				body: 'Haydn Wright uçuş bileti — İstanbul',
				mimeType: 'image/jpeg',
				filename: 'IMG-2026.jpg'
			})
		).toBe('2026-09-15-1105-haydn-wright-ucus-bileti-istanbul.jpg');
	});

	it('gövdesiz PDF eki', () => {
		expect(
			driveFileNameFor({
				at: new Date('2026-09-15T08:05:00.000Z'),
				timezone: 'Europe/Istanbul',
				body: null,
				mimeType: 'application/pdf',
				filename: null
			})
		).toBe('2026-09-15-1105-whatsapp-belge.pdf');
	});
});
