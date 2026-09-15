import { describe, expect, it } from 'vitest';
import { kisiBilgisiCikar } from './kisi-bilgisi';

describe('kisiBilgisiCikar', () => {
	it('ad + e-posta + telefon tek satırda', () => {
		expect(kisiBilgisiCikar('Haydn Wright wrighthaydn@aol.com +447796287848')).toEqual({
			first_name: 'Haydn',
			last_name: 'Wright',
			email: 'wrighthaydn@aol.com',
			phone: '+447796287848'
		});
	});

	it('üç kelimeli ad: son kelime soyad', () => {
		expect(kisiBilgisiCikar('Tracey Jane Carter 05321234567')).toMatchObject({
			first_name: 'Tracey Jane',
			last_name: 'Carter',
			phone: '05321234567'
		});
	});

	it('cümle içindeyse ad boş kalır, e-posta/telefon yine çıkar', () => {
		const r = kisiBilgisiCikar('Hastanın maili wrighthaydn@aol.com, yarın arayacağız');
		expect(r).toMatchObject({ first_name: null, last_name: null, email: 'wrighthaydn@aol.com' });
	});

	it('e-posta ya da telefon yoksa kişi bilgisi değildir', () => {
		expect(kisiBilgisiCikar('Dawit Abraham Alp paşa hotel')).toBeNull();
		expect(kisiBilgisiCikar('')).toBeNull();
		expect(kisiBilgisiCikar(null)).toBeNull();
	});
});
