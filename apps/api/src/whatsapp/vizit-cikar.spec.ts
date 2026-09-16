import { describe, expect, it } from 'vitest';
import { otelBul, tedaviPlaniBul, vizitCikar, vizitTuruBul } from './vizit-cikar';

/**
 * VIZIT-01 — metinler `docs/whatsapp-01` arşivinden birebir alındı (Rezervasyon,
 * TNC-ORBISMED REZERVASYON, Orbismed - Dentgroup Randevu grupları). Uydurma örnek
 * yok: çıkarım gerçek yazım biçimlerine (nokta/iki nokta karışık saat, yılın sona
 * yazılması, Türkçe karaktersiz yazım) dayanmak zorunda.
 */
describe('vizitCikar — gerçek WhatsApp mesajları', () => {
	it('Zaid Waldu ikinci vizit: "Geliş: 13.09.2026 21:35 / Dönüş: 19.09.2026 22:15"', () => {
		const r = vizitCikar({
			text: 'Zaid waldu, ikinci vizit\n\nGeliş: 13.09.2026 21:35\nDönüş: 19.09.2026 22:15\n\n\nRandevusunun oluşturulmasını rica ederim',
			messageDate: new Date('2026-09-09T12:56:00Z'),
			chatName: 'TNC-ORBISMED REZERVASYON'
		});
		expect(r).not.toBeNull();
		expect(r!.draft.visit_type).toBe('visit_2');
		expect(r!.draft.sequence).toBe(2);
		expect(r!.draft.arrival_at).toBe('2026-09-13T21:35:00.000Z');
		expect(r!.draft.arrival_time_known).toBe(true);
		expect(r!.draft.departure_at).toBe('2026-09-19T22:15:00.000Z');
		expect(r!.draft.clinic).toBe('TNC');
		expect(r!.confidence).toBe('high');
	});

	it('Zaid Waldu 1. vizit: yıl saatten SONRA yazılmış ("19 Ekim 20:35 2025")', () => {
		const r = vizitCikar({
			text: 'Zaid Waldu \nAll on 6 neodent, titanyum bara burada karar verilecek \n\nGelis: 19 Ekim 20:35 2025\nDönüş: 24 Ekim 21:00 2025\n\nRezervasyonunun oluşturulmasını rica ederim',
			messageDate: new Date('2025-10-15T18:26:00Z'),
			chatName: 'TNC-ORBISMED REZERVASYON'
		});
		expect(r).not.toBeNull();
		expect(r!.draft.arrival_at).toBe('2025-10-19T20:35:00.000Z');
		expect(r!.draft.departure_at).toBe('2025-10-24T21:00:00.000Z');
		expect(r!.draft.treatment_plan).toContain('All on 6');
	});

	it('Jennifer Severino RPT: tür rpt, sequence yok', () => {
		const r = vizitCikar({
			text: 'Jennifer Severino,rpt\n\n\nGeliş: 06.09.2026 15.00\nDönüş: 10.09.2026 22.15\n\n\nRandevusunun oluşturulmasını rica ederim',
			messageDate: new Date('2026-08-27T16:45:00Z'),
			chatName: 'TNC-ORBISMED REZERVASYON'
		});
		expect(r).not.toBeNull();
		expect(r!.draft.visit_type).toBe('rpt');
		expect(r!.draft.sequence).toBeNull();
		expect(r!.draft.arrival_at).toBe('2026-09-06T15:00:00.000Z');
		expect(r!.draft.departure_at).toBe('2026-09-10T22:15:00.000Z');
	});

	it('Dilyana Marinova: Dentgroup grubu, "ucak inis saati" ekli satırlar', () => {
		const r = vizitCikar({
			text: 'Dilyana Marinova \n\nGelis: 23.09.2026 20:40 ucak inis saati \nDönüş: 27.09.2026 21:45 ucak kalkis saati \n\nCift cene All on 6 Neodent Implant randevusunun olusturulmasini rica ederim.',
			messageDate: new Date('2026-08-29T10:15:00Z'),
			chatName: 'Orbismed - Dentgroup Randevu Grubu'
		});
		expect(r).not.toBeNull();
		expect(r!.draft.arrival_at).toBe('2026-09-23T20:40:00.000Z');
		expect(r!.draft.departure_at).toBe('2026-09-27T21:45:00.000Z');
		expect(r!.draft.clinic).toBe('Dentgroup');
		expect(r!.draft.treatment_plan).toContain('All on 6');
		// Vizit sözcüğü geçmiyor: tür uydurulmaz.
		expect(r!.draft.visit_type).toBe('other');
	});

	it('Lisa Gumersell: geliş/dönüş etiketi YOK, yalnız "ucak inis/kalkis saati"', () => {
		const r = vizitCikar({
			text: 'Lisa Gumersell \n\n24 kron + 2 dolgu + cift gece plagi \n\n17.09.2026 20:35 ucak inis saati \n\n24.09.2026 09:35 ucak kalkis saati \n\nSelin hocada Randevusunun olusturulmasini rica ederim.',
			messageDate: new Date('2026-09-11T17:31:00Z'),
			chatName: 'Orbismed - Dentgroup Randevu Grubu'
		});
		expect(r).not.toBeNull();
		expect(r!.draft.arrival_at).toBe('2026-09-17T20:35:00.000Z');
		expect(r!.draft.departure_at).toBe('2026-09-24T09:35:00.000Z');
		expect(r!.draft.doctor).toBe('Selin');
		expect(r!.draft.treatment_plan).toContain('24 kron');
	});

	it('Haydn Wright: uzun anamnez metni tarihleri bozmaz', () => {
		const r = vizitCikar({
			text: `Haydn Wright\n\nGelis: 05.10.2026 19:05 ucak inis saati \nDönüş: 09.10.2026 20:40 ucak kalkis saati. \n\nHastanin agzinda ust cenede 2 tane Straumann Roxolid SLA 4.1/10mm BL RC. \n\nUst cenede ki disler cekilip yerine 4 tane implant yapilip ust cene all on 6 e cevirilecek mevcut implantlarla. Alt cenede All on 6. \n\nImplantlari Neodent olacak. \n\nSpironolactone 50mg\nRamipril 10mg\n\nHastanin kullandigi ilaclar ve penisiline hassasiyeti var. \n\nRandevusunun olusturulmasini rica ederim.`,
			messageDate: new Date('2026-09-15T15:56:00Z'),
			chatName: 'Orbismed - Dentgroup Randevu Grubu'
		});
		expect(r).not.toBeNull();
		expect(r!.draft.arrival_at).toBe('2026-10-05T19:05:00.000Z');
		expect(r!.draft.departure_at).toBe('2026-10-09T20:40:00.000Z');
		expect(r!.draft.clinic).toBe('Dentgroup');
	});

	it('Jacek Wyszynski: "26 nisan gelis tarihi 2 mayis donus tarihi" — yıl yok, saat yok', () => {
		const r = vizitCikar({
			text: 'Jacek Wyszynski 2.ci vizit. \n\n26 nisan gelis tarihi 2 mayis donus tarihi. \n\n2 gecelik extra cost otel odemesi alinacak. \n\n1 std single oda Dumos Hotel.',
			messageDate: new Date('2026-03-18T16:06:00Z'),
			chatName: 'Orbismed Rezervasyon'
		});
		expect(r).not.toBeNull();
		expect(r!.draft.visit_type).toBe('visit_2');
		expect(r!.draft.arrival_at).toBe('2026-04-26T00:00:00.000Z');
		expect(r!.draft.arrival_time_known).toBe(false);
		expect(r!.draft.departure_at).toBe('2026-05-02T00:00:00.000Z');
		expect(r!.draft.departure_time_known).toBe(false);
		expect(r!.draft.hotel).toBe('Dumos');
	});

	it('Frankie Simpson: tek satır, "Geliş: 03.03.2025 17.30 Dönüş: 07.03.2025 23.45"', () => {
		const r = vizitCikar({
			text: 'Frankie Simpson Alt üst all on 4 Geliş: 03.03.2025 17.30 Dönüş: 07.03.2025 23.45 randevusunun oluşturulmasını rica ederim.',
			messageDate: new Date('2025-02-13T09:47:00Z'),
			chatName: 'TNC-ORBISMED REZERVASYON'
		});
		expect(r).not.toBeNull();
		expect(r!.draft.arrival_at).toBe('2025-03-03T17:30:00.000Z');
		expect(r!.draft.departure_at).toBe('2025-03-07T23:45:00.000Z');
		expect(r!.draft.treatment_plan).toContain('all on 4');
	});

	it('James Snook: "23 Şubat 2025 19.25" — yıl saatten ÖNCE', () => {
		const r = vizitCikar({
			text: "James Snook 2 kanal tedavi 25 zirkon kron Geliş: 23 Şubat 2025 19.25 dönüş: 02 Mart 2025 09.45 (Tedaviye 25 Şubat'ta başlanacak) randevusunun oluşturulmasını rica ederim.",
			messageDate: new Date('2025-02-14T16:18:00Z'),
			chatName: 'TNC-ORBISMED REZERVASYON'
		});
		expect(r).not.toBeNull();
		expect(r!.draft.arrival_at).toBe('2025-02-23T19:25:00.000Z');
		expect(r!.draft.departure_at).toBe('2025-03-02T09:45:00.000Z');
	});

	it('Jillian Evlat 2.visit: "2.visit geliş: 23 haziran 2025 21.55"', () => {
		const r = vizitCikar({
			text: 'Jillian Evlat 2.visit geliş: 23 haziran 2025 21.55 Dönüş: 28 Haziran 2025 20.00 randevusunun oluşturulmasını rica ederim.',
			messageDate: new Date('2025-03-07T10:50:00Z')
		});
		expect(r).not.toBeNull();
		expect(r!.draft.visit_type).toBe('visit_2');
		expect(r!.draft.arrival_at).toBe('2025-06-23T21:55:00.000Z');
	});

	it('Zaid Waldu konsültasyon: "Konsültasyon Geliş: 2 Mayıs 2025 20.45"', () => {
		const r = vizitCikar({
			text: 'Zaid Waldu Konsültasyon Geliş: 2 Mayıs 2025 20.45 Dönüş: 5 Mayıs 2025 21.00 randevusunun oluşturulmasını rica ederim.',
			messageDate: new Date('2025-05-01T17:08:00Z')
		});
		expect(r).not.toBeNull();
		expect(r!.draft.visit_type).toBe('consultation');
		expect(r!.draft.arrival_at).toBe('2025-05-02T20:45:00.000Z');
	});

	it('Dönüş bileti yoksa yalnız geliş dolar', () => {
		const r = vizitCikar({
			text: 'Donna Mcgurk 28 zirkon kron 6 implant Geliş: 5 Nisan 2025 20.15 (Dönüş bileti gelince yazacağım) randevusunun oluşturulmasını rica ederim.',
			messageDate: new Date('2025-03-14T12:31:00Z')
		});
		expect(r).not.toBeNull();
		expect(r!.draft.arrival_at).toBe('2025-04-05T20:15:00.000Z');
		expect(r!.draft.departure_at).toBeNull();
		// Tek tarih + kısmi kalıp: kullanıcı iki kere baksın.
		expect(r!.confidence).toBe('medium');
	});
});

describe('vizitCikar — öneri açılmaması gereken mesajlar', () => {
	it('tarihsiz RPT bildirimi öneri üretmez', () => {
		expect(
			vizitCikar({
				text: 'Jennifer Severino RPT Amber Seberino ile geliyor.',
				messageDate: new Date('2026-08-26T12:18:00Z')
			})
		).toBeNull();
	});

	it('muhasebe satırı öneri üretmez', () => {
		expect(
			vizitCikar({
				text: 'Jennifer Severino ikinci vizit ödemesinden 200 Gbp düşülecek.',
				messageDate: new Date('2025-06-22T16:05:00Z')
			})
		).toBeNull();
	});

	it('klinik günlük listesi öneri üretmez', () => {
		expect(
			vizitCikar({
				text: '09.09.26\n11:00 Jennifer Severino\n12:00 aynur tasman',
				messageDate: new Date('2026-09-08T18:15:00Z')
			})
		).toBeNull();
	});

	it('boş metin null döner', () => {
		expect(vizitCikar({ text: '   ' })).toBeNull();
	});
});

describe('vizitTuruBul', () => {
	it.each([
		['zaid waldu 2.ci vizit', 'visit_2', 2],
		['jacek wyszynski 2. vizit', 'visit_2', 2],
		['jillian evlat 2.visit gelis', 'visit_2', 2],
		['hasta ikinci vizit icin geliyor', 'visit_2', 2],
		['visit 3 randevusu', 'visit_3', 3],
		['ilk vizit', 'visit_1', 1],
		['jennifer severino,rpt', 'rpt', null],
		['zaid waldu konsultasyon', 'consultation', null],
		['sadece otel bilgisi', 'other', null]
	])('%s → %s', (metin, tur, seq) => {
		const r = vizitTuruBul(metin);
		expect(r.type).toBe(tur);
		expect(r.sequence).toBe(seq);
	});
});

describe('otelBul', () => {
	it.each([
		['1 twin bed Cedrus Hotel', 'Cedrus'],
		['Leaf River Suites hotel 1 pax', 'Leaf River Suites'],
		['1 std single oda Dumos Hotel.', 'Dumos'],
		['Zaid Waldu Laren Seaside bed & breakfast olarak revize edelim lütfen', null]
	])('%s → %s', (metin, beklenen) => {
		expect(otelBul(metin)).toBe(beklenen);
	});

	/*
	 * Bilinen sınır: hasta adı otel adının hemen önündeyse ayıramıyor — elimizde
	 * otel sözlüğü yok. Öneri kartında alan düzenlenebilir, kullanıcı kırpar.
	 */
	it('hasta adı otel adına bitişikse fazlasını da alır', () => {
		expect(otelBul('Lisa Gumersell City Live Hotel olarak revize edildi.')).toContain('City Live');
	});
});

describe('tedaviPlaniBul', () => {
	it('tedavi sözcüğü olmayan satırı plan saymaz', () => {
		expect(tedaviPlaniBul('Oteli henuz belli degil. Yazacagim.')).toBeNull();
	});

	it('kalıp sözleri ve tarihleri plandan atar', () => {
		const plan = tedaviPlaniBul(
			'Cift cene All on 6 Neodent Implant randevusunun olusturulmasini rica ederim.'
		);
		expect(plan).toBe('Cift cene All on 6 Neodent Implant');
	});
});
