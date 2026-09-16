import { describe, expect, it } from 'vitest';
import type { TransactionDraft } from '@verimaya/shared';
import {
	altKategoriEsle,
	kategoriEsle,
	kategoriTahmin,
	kategorileriDuzelt,
	trAnahtar,
	type TenantKategori
} from './kategori';
import { odemeYontemiDuzelt } from './odeme-yontemi';

const KATEGORILER: TenantKategori[] = [
	{ kind: 'income', name: 'Operasyon', subcategories: ['Saç ekimi', 'İmplant', 'Genel'] },
	{ kind: 'expense', name: 'Operasyon', subcategories: ['Saç ekimi', 'Genel'] },
	{ kind: 'expense', name: 'Konaklama', subcategories: ['Otel', 'Extra gece'] },
	{ kind: 'expense', name: 'Transfer', subcategories: ['Havalimanı'] },
	{ kind: 'expense', name: 'Pazarlama', subcategories: ['Meta Ads'] }
];

function taslak(over: Partial<TransactionDraft> = {}): TransactionDraft {
	return {
		kind: 'expense',
		amount: 10_000,
		currency: 'TRY',
		title: 'test',
		occurred_on: '2026-09-16',
		...over
	} as TransactionDraft;
}

describe('trAnahtar', () => {
	it('Türkçe harf ve büyük/küçük farkını siler', () => {
		expect(trAnahtar('SAÇ EKİMİ')).toBe(trAnahtar('sac ekimi'));
		expect(trAnahtar('Konaklama')).toBe('konaklama');
		expect(trAnahtar('  Çek ')).toBe('cek');
	});
});

describe('kategoriEsle', () => {
	it('türü uyan kategoriyi kanonik adıyla döner', () => {
		expect(kategoriEsle(KATEGORILER, 'expense', 'konaklama')).toBe('Konaklama');
		expect(kategoriEsle(KATEGORILER, 'expense', 'KONAKLAMA')).toBe('Konaklama');
	});

	it('kind uyuşmazsa eşleşmez — gelir taslağına gider kategorisi yazılamaz', () => {
		expect(kategoriEsle(KATEGORILER, 'income', 'Konaklama')).toBeNull();
		expect(kategoriEsle(KATEGORILER, 'income', 'Operasyon')).toBe('Operasyon');
	});

	it('listede olmayan uydurma ad null olur', () => {
		expect(kategoriEsle(KATEGORILER, 'expense', 'Accommodation')).toBeNull();
		expect(kategoriEsle(KATEGORILER, 'expense', null)).toBeNull();
	});
});

describe('altKategoriEsle', () => {
	it('yalnız seçili kategorinin alt listesinden', () => {
		expect(altKategoriEsle(KATEGORILER, 'expense', 'Konaklama', 'otel')).toBe('Otel');
		expect(altKategoriEsle(KATEGORILER, 'expense', 'Konaklama', 'Saç ekimi')).toBeNull();
	});

	it('kategori yoksa alt kategori de yok', () => {
		expect(altKategoriEsle(KATEGORILER, 'expense', null, 'Otel')).toBeNull();
	});
});

describe('kategorileriDuzelt', () => {
	it('listedışı değerleri null yapar, alt kategoriyi kategoriye bağlar', () => {
		const [r] = kategorileriDuzelt(
			[taslak({ category: 'Hotel', subcategory: 'Otel' })],
			KATEGORILER
		);
		expect(r.category).toBeNull();
		expect(r.subcategory).toBeNull();
	});

	it('kiracıda hiç kategori yoksa dokunmaz', () => {
		const [r] = kategorileriDuzelt([taslak({ category: 'Her neyse' })], []);
		expect(r.category).toBe('Her neyse');
	});
});

describe('kategoriTahmin', () => {
	it('anahtar kelimeyi kiracı listesine eşler, sabit ad yazmaz', () => {
		expect(kategoriTahmin('Dumos Hotel konaklama faturasi', 'expense', KATEGORILER)).toBe(
			'Konaklama'
		);
		expect(kategoriTahmin('havalimani transfer ucreti', 'expense', KATEGORILER)).toBe('Transfer');
	});

	it('kiracıda karşılığı yoksa null — eski sabit "Operasyon" davranışı yok', () => {
		expect(kategoriTahmin('Dumos Hotel konaklama faturasi', 'expense', [])).toBeNull();
		expect(kategoriTahmin('Dumos Hotel konaklama faturasi', 'income', KATEGORILER)).toBeNull();
	});

	it('hiçbir ipucu yoksa null', () => {
		expect(kategoriTahmin('2600 prim verildi', 'expense', KATEGORILER)).toBeNull();
	});
});

describe('odemeYontemiDuzelt', () => {
	it('kısa biçimleri Finans listesindeki değere çeker', () => {
		expect(odemeYontemiDuzelt('Kart')).toBe('Kredi Kartı');
		expect(odemeYontemiDuzelt('havale')).toBe('Banka Havalesi/EFT');
		expect(odemeYontemiDuzelt('EFT')).toBe('Banka Havalesi/EFT');
		expect(odemeYontemiDuzelt('nakit')).toBe('Nakit');
		expect(odemeYontemiDuzelt('cek')).toBe('Çek');
	});

	it('boş değer null, tanınmayan değer korunur', () => {
		expect(odemeYontemiDuzelt(null)).toBeNull();
		expect(odemeYontemiDuzelt('  ')).toBeNull();
		expect(odemeYontemiDuzelt('Kripto')).toBe('Kripto');
	});
});
