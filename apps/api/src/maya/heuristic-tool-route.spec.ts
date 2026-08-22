import { describe, expect, it } from 'vitest';
import type { MayaContactRef } from '@verimaya/shared';
import { heuristicRouteMayaTool } from './heuristic-tool-route';

const CONTACT_REF = '11111111-1111-4111-8111-111111111111';
const contacts: MayaContactRef[] = [{ token: 'KISI_1', contact_ref: CONTACT_REF }];

/**
 * AI-11a — deterministik yönlendirici. İki şey kanıtlanıyor:
 * 1. Doğru soru doğru araca gider (ve `contact_ref` uydurulmaz).
 * 2. **Bilgi bankası yolu bozulmaz** — fiyat/paket/kural soruları hiçbir araca takılmaz.
 */
describe('heuristicRouteMayaTool', () => {
	it('kişi + borç sorusu contactBalance seçer', () => {
		expect(heuristicRouteMayaTool('KISI_1 bey ne kadar borçlu?', contacts)).toEqual({
			tool: 'contactBalance',
			params: { contact_ref: CONTACT_REF }
		});
	});

	it('kişi + randevu sorusu contactAppointments seçer', () => {
		expect(heuristicRouteMayaTool('KISI_1 randevusu ne zaman?', contacts)).toEqual({
			tool: 'contactAppointments',
			params: { contact_ref: CONTACT_REF }
		});
	});

	it('kişisiz alacak sorusu openBalances seçer', () => {
		expect(heuristicRouteMayaTool('Kimlerden alacağımız var?', [])).toEqual({
			tool: 'openBalances',
			params: {}
		});
	});

	it('dönem sorusu periodSummary + kapalı kümeden dönem seçer', () => {
		expect(heuristicRouteMayaTool('Bu ay ne kadar tahsilat yaptık?', [])).toEqual({
			tool: 'periodSummary',
			params: { period: 'this_month' }
		});
		expect(heuristicRouteMayaTool('Geçen ay toplam gider ne kadardı?', [])).toEqual({
			tool: 'periodSummary',
			params: { period: 'last_month' }
		});
	});

	it('temassızlık sorusu untouchedContacts + 30/60/90 seçer', () => {
		expect(heuristicRouteMayaTool('Kime dönülmedi?', [])).toEqual({
			tool: 'untouchedContacts',
			params: { days: 30 }
		});
		expect(heuristicRouteMayaTool('90 gündür temassız kimler var?', [])).toEqual({
			tool: 'untouchedContacts',
			params: { days: 90 }
		});
	});

	it('bilgi bankası sorusu hiçbir araca takılmaz — o yol bozulmaz', () => {
		expect(heuristicRouteMayaTool('Saç ekimi fiyatımız ne?', [])).toBeNull();
		expect(heuristicRouteMayaTool('Kapora oranı kaç?', [])).toBeNull();
		expect(heuristicRouteMayaTool('İptal politikanız nedir?', [])).toBeNull();
	});

	it('eşleşme yoksa null döner — tahmin yok', () => {
		expect(heuristicRouteMayaTool('Merhaba', [])).toBeNull();
		expect(heuristicRouteMayaTool('', [])).toBeNull();
	});

	it('sorudaki KISI token listede yoksa kişi aracı seçilmez', () => {
		// Sunucu o kişiyi çözemediyse model de çözemez; uydurma `contact_ref` üretilmez.
		expect(heuristicRouteMayaTool('KISI_9 ne kadar borçlu?', contacts)).toBeNull();
	});
});
