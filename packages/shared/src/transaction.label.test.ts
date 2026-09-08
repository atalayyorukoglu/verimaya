import { describe, expect, it } from 'vitest';
import { deriveTransactionLabel, deriveTransactionLines } from './transaction.js';

describe('deriveTransactionLabel', () => {
	it('prefers non-empty title', () => {
		expect(
			deriveTransactionLabel({
				title: '  Depozito  ',
				category: 'Operasyon',
				subtitle: 'Saç ekimi',
				contact_display_name: 'Ali',
				description: 'ignored'
			})
		).toBe('Depozito');
	});

	it('falls back to category › subtitle', () => {
		expect(
			deriveTransactionLabel({
				title: null,
				category: 'Konaklama',
				subtitle: 'Otel',
				contact_display_name: 'Ali',
				description: 'line'
			})
		).toBe('Konaklama › Otel');
	});

	it('falls back to category alone when subtitle missing', () => {
		expect(
			deriveTransactionLabel({
				title: '   ',
				category: 'Transfer',
				subtitle: null,
				contact_label: 'X',
				description: 'line'
			})
		).toBe('Transfer');
	});

	it('falls back to contact_display_name then contact_label', () => {
		expect(
			deriveTransactionLabel({
				title: null,
				category: null,
				subtitle: null,
				contact_display_name: '  Hasta A  ',
				contact_label: 'label',
				description: 'desc'
			})
		).toBe('Hasta A');
		expect(
			deriveTransactionLabel({
				title: null,
				category: null,
				subtitle: null,
				contact_display_name: null,
				contact_label: '  Serbest etiket  ',
				description: 'desc'
			})
		).toBe('Serbest etiket');
	});

	it('falls back to description first line', () => {
		expect(
			deriveTransactionLabel({
				title: null,
				category: null,
				subtitle: null,
				contact_display_name: null,
				contact_label: null,
				description: 'İlk satır\nİkinci satır'
			})
		).toBe('İlk satır');
	});

	it('returns em dash when nothing usable', () => {
		expect(
			deriveTransactionLabel({
				title: null,
				category: '  ',
				subtitle: '',
				contact_display_name: null,
				contact_label: ' ',
				description: '  \nnext'
			})
		).toBe('—');
	});
});

describe('deriveTransactionLines', () => {
	it('aktarılan kayıtta tür/kategori/tarih yerine alt kategoriyi gösterir', () => {
		const lines = deriveTransactionLines({
			title: 'Expense · Operasyon Giderleri · Otel/Apart · 08 Sep 2026',
			category: 'Operasyon Giderleri',
			subtitle: 'Otel/Apart',
			contact_display_name: 'Sever Suites',
			case_contact_display_name: 'Linda Wilson'
		});
		expect(lines.primary).toBe('Otel/Apart');
		expect(lines.secondary).toBe('Sever Suites · Linda Wilson');
	});

	it('alt kategori yoksa başlığa düşer', () => {
		const lines = deriveTransactionLines({
			title: 'Klinik komisyonu',
			subtitle: null,
			contact_display_name: 'Anka Lab'
		});
		expect(lines.primary).toBe('Klinik komisyonu');
		expect(lines.secondary).toBe('Anka Lab');
	});

	it('kişi ile hasta aynıysa iki kez yazmaz', () => {
		const lines = deriveTransactionLines({
			subtitle: 'Tedavi Ücreti',
			contact_display_name: 'Paul Scott',
			case_contact_display_name: 'Paul Scott'
		});
		expect(lines.secondary).toBe('Paul Scott');
	});

	it('ikisi de yoksa tire', () => {
		expect(deriveTransactionLines({ subtitle: 'Avans' }).secondary).toBe('—');
	});
});

