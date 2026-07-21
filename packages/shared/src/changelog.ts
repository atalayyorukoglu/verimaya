export type ChangeType = 'eklendi' | 'degisti' | 'duzeltildi' | 'kaldirildi' | 'guvenlik';

export type ChangelogChange = {
	type: ChangeType;
	module: string;
	text: string;
	featureId?: string;
};

export type ChangelogEntry = {
	version: string;
	date: string;
	title?: string;
	changes: ChangelogChange[];
};

/**
 * Tek kaynak: /yenilikler + (ileride) CHANGELOG.md buradan beslenir.
 * docs/CHANGELOG-KURALLARI.md
 */
export const changelog: ChangelogEntry[] = [
	{
		version: '0.1.0',
		date: '2026-07-20',
		title: 'Faz 0a demo arayüzü',
		changes: [
			{
				type: 'eklendi',
				module: 'Platform',
				text: 'Panel iskeleti: sol menü, hızlı arama, açık/koyu tema ve rol bazlı menü.',
				featureId: 'multi-tenant'
			},
			{
				type: 'eklendi',
				module: 'Hastalar',
				text: 'Hasta listesi, detay, dosya paneli ve finans özeti demo veriyle kullanılabilir.',
				featureId: 'patients-list'
			},
			{
				type: 'eklendi',
				module: 'Randevu',
				text: 'Gün/hafta takvim görünümü; otel ve transfer notları formda.',
				featureId: 'appointments-calendar'
			},
			{
				type: 'eklendi',
				module: 'Finans',
				text: 'İşlem defteri, P2P bakiyeler ve kategori/alt kategori alanları.',
				featureId: 'finance-ledger'
			},
			{
				type: 'eklendi',
				module: 'Finans',
				text: 'AI ile WhatsApp işlem aktarımı: yapıştır veya kuyruktan seç, onayla.',
				featureId: 'whatsapp-import'
			},
			{
				type: 'eklendi',
				module: 'Raporlama',
				text: 'Özet ve kategori drill-down raporları dönem filtresiyle.',
				featureId: 'reports-dashboard'
			},
			{
				type: 'eklendi',
				module: 'Hastalar',
				text: 'Kişi ve hasta listelerinden çift kayıt tarama; şüpheli grupları birleştirme.',
				featureId: 'duplicate-scan'
			},
			{
				type: 'degisti',
				module: 'Platform',
				text: 'Açık/koyu tema renkleri TickPort sıcak nötr paletine geçti (terracotta vurgu).'
			}
		]
	}
];
