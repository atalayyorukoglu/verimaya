import { describe, expect, it } from 'vitest';
import { randevuIpucuCikar } from './randevu-ipucu';

/** Örnekler `docs/whatsapp-01` Rezervasyon / TNC / Dentgroup dökümlerinden. */
const mesajTarihi = new Date('2026-09-16T09:00:00.000Z');

describe('randevuIpucuCikar — talep + tarih varsa ipucu', () => {
	it('TNC talebinde geliş tarihi başlangıç olur', () => {
		const h = randevuIpucuCikar({
			text: 'Frankie Simpson Alt üst all on 4 Geliş: 03.03.2027 17.30 Dönüş: 07.03.2027 23.45 randevusunun oluşturulmasını rica ederim.',
			messageDate: mesajTarihi,
			chatName: 'TNC-ORBISMED REZERVASYON'
		});
		expect(h).not.toBeNull();
		expect(h!.starts_at).toBe('2027-03-03T17:30:00.000Z');
		expect(h!.clinic).toBe('TNC');
		expect(h!.contact_id).toBeNull();
		expect(h!.note).toContain('Frankie Simpson');
	});

	it('klinik saati geliş tarihini yener ("18 Eylül saat 10:00")', () => {
		const h = randevuIpucuCikar({
			text: 'Susan Manyanya Geliş: 15.09.2027 21:35 Dönüş: 25.09.2027 09:40. 18 Eylül 2027 saat 10:00 check-up randevusunun oluşturulmasını rica ederim.',
			messageDate: mesajTarihi,
			chatName: 'Orbismed Rezervasyon'
		});
		expect(h!.starts_at).toBe('2027-09-18T10:00:00.000Z');
	});

	it('grup adından klinik okunur (Dentgroup)', () => {
		const h = randevuIpucuCikar({
			text: 'Cift cene All on 6 Neodent Implant randevusunun olusturulmasini rica ederim. Gelis: 04.10.2027 12:00',
			messageDate: mesajTarihi,
			chatName: 'Orbismed - Dentgroup Randevu Grubu'
		});
		expect(h!.clinic).toBe('Dentgroup');
		expect(h!.starts_at).toBe('2027-10-04T12:00:00.000Z');
	});

	it('"randevu oluşturalım" kalıbı da sayılır', () => {
		const h = randevuIpucuCikar({
			text: 'Gelis 24.09.2027, Susan Manyanya Check up randevusu oluşturalım eski hastamiz',
			messageDate: mesajTarihi
		});
		expect(h).not.toBeNull();
		expect(h!.starts_at).toBe('2027-09-24T00:00:00.000Z');
	});

	it('İngilizce "appointment" da kalıp sayılır', () => {
		const h = randevuIpucuCikar({
			text: 'Please arrange the appointment for 12.11.2027 14:00',
			messageDate: mesajTarihi
		});
		expect(h!.starts_at).toBe('2027-11-12T14:00:00.000Z');
	});
});

describe('randevuIpucuCikar — ipucu üretilmeyen mesajlar', () => {
	it('talep kalıbı yoksa null', () => {
		expect(
			randevuIpucuCikar({ text: 'Zaid Waldu otelini Tema 242 olarak güncelleyelim lütfen.' })
		).toBeNull();
	});

	it('tarih çıkarılamıyorsa null — tarihsiz form iş çıkarır, bilgi vermez', () => {
		expect(
			randevuIpucuCikar({
				text: 'Selin hocadan randevusunun olusturulmasini rica ederim. Eski hastamiz.',
				messageDate: mesajTarihi
			})
		).toBeNull();
	});

	it('iptal/erteleme cümlesi yeni randevu değildir', () => {
		expect(
			randevuIpucuCikar({
				text: '12.10.2027 randevusunu iptal edelim, hasta gelmeyecek.',
				messageDate: mesajTarihi
			})
		).toBeNull();
	});

	it('boş gövdede null', () => {
		expect(randevuIpucuCikar({ text: '' })).toBeNull();
		expect(randevuIpucuCikar({ text: null })).toBeNull();
	});
});
