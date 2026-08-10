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
 * Tek kaynak: /changelog + (ileride) CHANGELOG.md buradan beslenir.
 * docs/CHANGELOG-KURALLARI.md
 */
export const changelog: ChangelogEntry[] = [
	{
		version: '0.8.0',
		date: '2026-08-10',
		title: 'Kişiler tek modül',
		changes: [
			{
				type: 'degisti',
				module: 'Kişiler',
				text: 'Hastalar ile Kişiler tek listede birleşti; menüde artık yalnız Kişiler var, eski /patients linkleri Kişiler’e yönlenir.',
				featureId: 'patients-list'
			},
			{
				type: 'degisti',
				module: 'Kişiler',
				text: 'Kişi kartında ad ve soyad ayrı tutulur; kaynak, alt kaynak, kampanya ve referans eden kişi alanları formda toplanır.'
			},
			{
				type: 'kaldirildi',
				module: 'Platform',
				text: 'Eski hastalar API yüzeyi kalktı; dış webhook olayı artık contact.created olarak gönderilir.'
			}
		]
	},
	{
		version: '0.7.0',
		date: '2026-08-07',
		title: 'Hub yenileme ve Veri Maya markası',
		changes: [
			{
				type: 'degisti',
				module: 'Platform',
				text: 'Görünen marka adı Veri Maya olarak hizalandı; domain ve kod kimliği verimaya kaldı.'
			},
			{
				type: 'eklendi',
				module: 'Pazarlama',
				text: 'Pazarlama sitesinde Türkçe/İngilizce dil değiştirici ve hero sohbet grubu çevirileri kullanılabilir (URL locale ağacı henüz yok).'
			},
			{
				type: 'degisti',
				module: 'Pazarlama',
				text: 'Ana sayfa, App/CRM/Kaynaklar/Araçlar sayfaları ve pazarlama metinleri fayda odaklı yenilendi.'
			},
			{
				type: 'duzeltildi',
				module: 'Platform',
				text: 'Apex hub’da tema ve mobil menü static sayfada çalışır; CSP hash’leri build ile senkron tutulur.'
			}
		]
	},
	{
		version: '0.6.0',
		date: '2026-07-30',
		title: 'GHL bağlantısı ve ürün içi karne',
		changes: [
			{
				type: 'eklendi',
				module: 'Entegrasyonlar',
				text: 'Ayarlar’dan GoHighLevel hesabını bağlama ekranı ve alan sahipliği kuralları hazır (durum: kod hazır). Gerçek tenant go-live kabulü ayrıdır.',
				featureId: 'ghl-sync'
			},
			{
				type: 'eklendi',
				module: 'Platform',
				text: 'Panelde ürün içi yapay zeka karnesini doldurabilir, sistem cevaplarını çekebilir ve iki ölçümü karşılaştırabilirsiniz.',
				featureId: 'in-product-scorecard'
			},
			{
				type: 'eklendi',
				module: 'Entegrasyonlar',
				text: 'Meta ve Google Ads OAuth ve günlük metrik çekimi kodda hazır; gerçek hesap go-live kabulü (7 gün veri, idempotent sync) bekliyor.',
				featureId: 'ads-connect'
			}
		]
	},
	{
		version: '0.5.0',
		date: '2026-07-30',
		title: 'Ücretsiz yapay zeka karnesi',
		changes: [
			{
				type: 'eklendi',
				module: 'Platform',
				text: 'Vitrinden üyeliksiz yapay zeka karnesini 5 dakikada doldurabilir; kanıtı olmayan alanları net cümlelerle görebilirsiniz.',
				featureId: 'free-ai-scorecard'
			}
		]
	},
	{
		version: '0.4.0',
		date: '2026-07-22',
		title: 'Yayın öncesi kontrol',
		changes: [
			{
				type: 'eklendi',
				module: 'Pazarlama',
				text: 'Yayın Öncesi ekranında uyumluluk, birim ekonomi ve ölçüm eşiğini tek bakışta kontrol edebilirsiniz; bu bir uyarıdır, engel değildir.',
				featureId: 'campaign-precheck'
			}
		]
	},
	{
		version: '0.3.0',
		date: '2026-07-22',
		title: 'Gerçek ROAS raporu',
		changes: [
			{
				type: 'eklendi',
				module: 'Raporlama',
				text: 'Raporlar’da Gerçek ROAS sekmesiyle reklam harcamanızı dönem tahsilatıyla kıyaslayabilir; CPL, CPA ve kaynak kırılımını görebilirsiniz.',
				featureId: 'real-roas'
			}
		]
	},
	{
		version: '0.2.0',
		date: '2026-07-22',
		title: 'Pazarlama araçları',
		changes: [
			{
				type: 'eklendi',
				module: 'Pazarlama',
				text: 'Platform ROAS’ını gerçek kâr, başabaş ve reklam tavanına çeviren Hesap aracını kullanabilirsiniz.',
				featureId: 'truth-calculator'
			},
			{
				type: 'eklendi',
				module: 'Pazarlama',
				text: 'CPC ve funnel oranlarıyla satış başı maliyet, trafik ışığı ve ölçek tavanını Simülatör’de hesaplayabilirsiniz.',
				featureId: 'ad-simulator'
			},
			{
				type: 'eklendi',
				module: 'Pazarlama',
				text: 'Reklam veya landing metnindeki yasaklı sağlık ifadelerini Uyumluluk taramasıyla yakalayabilirsiniz.',
				featureId: 'ad-compliance'
			},
			{
				type: 'eklendi',
				module: 'Pazarlama',
				text: 'UTM linki üretebilir; 60/30/10 bütçe ve 3:2:2 kreatif dağılımını Şablonlar’dan çıkarabilirsiniz.',
				featureId: 'marketing-templates'
			},
			{
				type: 'eklendi',
				module: 'Pazarlama',
				text: 'Consent, CAPI ve CRM geri bildirimi checklist’iyle Ölçüm Olgunluğu (Trust Score) puanını görebilirsiniz.',
				featureId: 'trust-score'
			}
		]
	},
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
