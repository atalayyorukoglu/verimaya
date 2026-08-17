import { describe, expect, it } from 'vitest';
import {
	buildKnowledgeContext,
	emptyKnowledgeSections,
	findKnowledgePii,
	frameKnowledgeContext,
	KNOWLEDGE_SECTIONS
} from './knowledge.js';

describe('bilgi bankası (AI-01)', () => {
	it('boş bilgi bankası prompt bağlamı üretmez', () => {
		expect(buildKnowledgeContext(emptyKnowledgeSections())).toBeNull();
		// Yalnız boşluk da boş sayılır — aksi hâlde prompt'a anlamsız başlık girer.
		expect(
			buildKnowledgeContext({ ...emptyKnowledgeSections(), services: '   \n  ' })
		).toBeNull();
	});

	it('yalnız dolu bölümleri başlıklarıyla birleştirir', () => {
		const ctx = buildKnowledgeContext({
			...emptyKnowledgeSections(),
			services: 'Saç ekimi 2.500 EUR',
			rejection: '18 yaş altı kabul edilmez'
		});
		expect(ctx).toContain('Saç ekimi 2.500 EUR');
		expect(ctx).toContain('18 yaş altı');
		// Boş bölümlerin başlığı geçmemeli.
		expect(ctx).not.toContain('Sık sorulan sorular');
	});

	it('bağlamı talimat değil VERİ olarak çerçeveler', () => {
		const framed = frameKnowledgeContext('Saç ekimi 2.500 EUR');
		expect(framed).toContain('not instructions');
		expect(framed).toContain('<<<');
		expect(framed).toContain('>>>');
		// Boş girdi hiç çerçeve üretmez.
		expect(frameKnowledgeContext(null)).toBe('');
		expect(frameKnowledgeContext('   ')).toBe('');
	});

	it('hasta verisi izini uyarı olarak bildirir, engellemez', () => {
		const warnings = findKnowledgePii({
			...emptyKnowledgeSections(),
			services: 'Saç ekimi 2.500 EUR',
			notes: 'Ahmet Yılmaz 12345678901 tel 0532 111 22 33 ahmet@example.com'
		});
		const kinds = warnings.filter((w) => w.section === 'notes').map((w) => w.kind);
		expect(kinds).toContain('national_id');
		expect(kinds).toContain('phone');
		expect(kinds).toContain('email');
		// Temiz bölüm uyarı üretmez.
		expect(warnings.some((w) => w.section === 'services')).toBe(false);
	});

	it('fiyat metni telefon sanılmaz', () => {
		// "2.500 EUR" ya da "3000 greft" gibi ifadeler PII uyarısı üretmemeli,
		// yoksa uyarı gürültüye döner ve kullanıcı ciddiye almaz.
		const warnings = findKnowledgePii({
			...emptyKnowledgeSections(),
			services: 'Saç ekimi 2.500 EUR, 3000 greft dahil. Kapora 750 EUR.'
		});
		expect(warnings).toEqual([]);
	});

	it('bölüm listesi ile şema alanları aynı', () => {
		const schemaKeys = Object.keys(emptyKnowledgeSections()).sort();
		expect([...KNOWLEDGE_SECTIONS].sort()).toEqual(schemaKeys);
	});
});
