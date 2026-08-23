export type FeatureStatus = 'kod-hazir' | 'pilotta' | 'yayinda' | 'harici-onay-bekliyor';

export type FeatureModule =
	| 'Hasta Takibi'
	| 'Randevu'
	| 'Finans'
	| 'WhatsApp'
	| 'Entegrasyonlar'
	| 'Raporlama'
	| 'Pazarlama'
	| 'Platform';

export type Feature = {
	id: string;
	module: FeatureModule;
	title: string;
	description: string;
	status: FeatureStatus;
	/** Set when status is yayinda — links to changelog */
	released_at?: string;
	version?: string;
};

/**
 * Tek kaynak: /toolkit (eski /features → 308) buradan render edilir.
 * Durum taksonomisi: docs/CHANGELOG-KURALLARI.md § Özellik durumu.
 * "Yayında"ya geçen özellik aynı commit'te changelog.ts'e de yazılır.
 */
export const features: Feature[] = [
	{
		id: 'ai-knowledge-base',
		module: 'WhatsApp',
		title: 'Bilgi bankası',
		description:
			'Hizmetler, fiyatlar, ödeme kuralları ve red gerekçeleri Ayarlar’dan giriliyor; WhatsApp ayrıştırması ve Maya bu bilgiden besleniyor. Değişiklikler sürümleniyor.',
		status: 'kod-hazir'
	},
	{
		id: 'ai-record-suggestions',
		module: 'Randevu',
		title: 'Randevu güncelleme onay kuyruğu',
		description:
			'WhatsApp mesajından çıkan randevu tarihi değişikliği öneri olarak kuyruğa düşer; her kart tek tek onaylanır, toplu onay yoktur. Eşleşme belirsizse öneri üretilmez.',
		status: 'kod-hazir'
	},
	{
		id: 'ai-operation-alerts',
		module: 'Randevu',
		title: 'Operasyon alarmları',
		description:
			'Uçuş ve transfer gibi zaman kilitli kalemler için eşiğe gelindiğinde uyarı üretilir. Deterministik kod — yapay zekâ değil.',
		status: 'kod-hazir'
	},
	{
		id: 'ai-evidence',
		module: 'WhatsApp',
		title: 'Taslakta kaynak izi',
		description:
			'Taslaktaki her alan hangi cümleden çıktığını taşır; kaynak rozetine tıklayınca mesajda alıntı vurgulanır. Uydurma alıntı sunucuda düşürülür.',
		status: 'kod-hazir'
	},
	{
		id: 'ai-accuracy',
		module: 'Raporlama',
		title: 'AI isabet ölçümü',
		description:
			'Taslakların ne kadarı dokunulmadan onaylandı, hangi alan en çok düzeltiliyor, Maya neyi cevaplayamıyor. Cevaplanamayan sorular bilgi bankası yönlendirmesiyle gösterilir.',
		status: 'kod-hazir'
	},
	{
		id: 'maya-live-data',
		module: 'Platform',
		title: 'Maya canlı veri',
		description:
			'Maya bakiye, açık alacak, randevu, dönem özeti ve temassız kişiler sorularını canlı veriden cevaplar. Rakamı veritabanı verir, model yalnız hangi sorgunun çalışacağını seçer; izin araç başına kontrol edilir.',
		status: 'kod-hazir'
	},
	{
		id: 'contact-titles',
		module: 'Hasta Takibi',
		title: 'Kişi ünvanları',
		description:
			'Hekim, koordinatör, satış, reklam uzmanı gibi görev etiketleri; liste Ayarlar’dan yönetilir. Ünvan tanımlayıcıdır, yetkiyi değiştirmez.',
		status: 'kod-hazir'
	},
	{
		id: 'appointment-doctor',
		module: 'Randevu',
		title: 'Randevuda hekim',
		description:
			'Randevuya hekim atanır; randevu metrikleri hekim kırılımı ve hekim × randevu tipi çapraz sayımı döndürür (RPT oranı buradan hesaplanır).',
		status: 'kod-hazir'
	},
	{
		id: 'incidents',
		module: 'Hasta Takibi',
		title: 'Olay kaydı',
		description:
			'Hasta dosyasından tek tıkla açılan sorun kaydı: revizyon gerekti, komplikasyon, süreç gecikmesi. Opsiyonel maliyet ve randevu bağı taşır, çözüldü olarak kapatılır. v1 yalnız klinik departmanı.',
		status: 'kod-hazir'
	},
	{
		id: 'referral-value',
		module: 'Raporlama',
		title: 'Referans değeri',
		description:
			'Kim kaç kişi getirdi, o kişilerden ne kazanıldı, referans verenin ünvanı ve koordinatörü kim. Rakamlar kişi kartındaki finans özetiyle aynı kaynaktan gelir.',
		status: 'kod-hazir'
	},
	{
		id: 'report-compare',
		module: 'Raporlama',
		title: 'Dönem karşılaştırması',
		description:
			'Özet ve randevu metrikleri önceki dönemle karşılaştırılır. Önceki dönem aynı gün sayısında ve hemen öncesinde biten penceredir; az kayda dayanan değişimde yüzde gösterilmez.',
		status: 'kod-hazir'
	},
	{
		id: 'campaign-assistant',
		module: 'Pazarlama',
		title: 'Kampanya Asistanı',
		description:
			'Pazarlama hub’ı — gerçek ROAS hesabı, simülatör, uyumluluk taraması ve yayın öncesi kontrolleri tek yerde.',
		status: 'kod-hazir',
		released_at: '2026-07-22',
		version: '0.2.0'
	},
	{
		id: 'patients-list',
		module: 'Hasta Takibi',
		title: 'Hasta listesi ve detay',
		description:
			'Lead ve hasta kayıtlarını listeleyin, durumlarını takip edin, not ve iletişim bilgilerine tek ekrandan ulaşın.',
		status: 'kod-hazir',
		released_at: '2026-07-17',
		version: '0.1.0'
	},
	{
		id: 'appointments-calendar',
		module: 'Randevu',
		title: 'Randevu takvimi',
		description:
			'Klinik, otel ve transfer notlarıyla birlikte randevuları gün/hafta görünümünde yönetin.',
		status: 'kod-hazir',
		released_at: '2026-07-17',
		version: '0.1.0'
	},
	{
		id: 'finance-ledger',
		module: 'Finans',
		title: 'Gelir-gider işlemleri',
		description:
			'Tahsilat ve ödemeleri hasta bağlantısı, ödeme durumu ve fatura bilgisiyle kaydedin.',
		status: 'kod-hazir',
		released_at: '2026-07-17',
		version: '0.1.0'
	},
	{
		id: 'whatsapp-import',
		module: 'Finans',
		title: 'AI ile WhatsApp işlem aktarımı',
		description:
			'Grup mesajını yapıştırın veya WAHA kuyruğundan seçin; AI işlemleri ayrıştırır, onay sonrası kayıt açılır.',
		status: 'kod-hazir',
		released_at: '2026-07-20',
		version: '0.1.0'
	},
	{
		id: 'ghl-sync',
		module: 'Entegrasyonlar',
		title: 'GoHighLevel senkronu',
		description:
			'GHL lead ve fırsatlarını alan bazlı sahiplik kurallarıyla Verimaya ile eşleştirin.',
		status: 'kod-hazir'
	},
	{
		id: 'ads-metrics',
		module: 'Entegrasyonlar',
		title: 'Meta ve Google Ads metrikleri',
		description:
			'Reklam harcaması ve dönüşümleri günlük özet olarak panele çekin.',
		status: 'harici-onay-bekliyor'
	},
	{
		id: 'ads-connect',
		module: 'Entegrasyonlar',
		title: 'Meta & Google Ads bağlantısı',
		description:
			'Reklam hesabınızı bağlayın; kampanya harcaması günlük çekilir ve Gerçek ROAS raporunu besler.',
		status: 'harici-onay-bekliyor'
	},
	{
		id: 'n8n-api',
		module: 'Entegrasyonlar',
		title: 'n8n ve dış API',
		description:
			'Scope’lu API anahtarı ve imzalı webhook’larla otomasyonları bağlayın.',
		status: 'kod-hazir',
		released_at: '2026-07-20',
		version: '0.1.0'
	},
	{
		id: 'reports-dashboard',
		module: 'Raporlama',
		title: 'Özet raporlar ve dashboard',
		description:
			'Lead, dönüşüm, tahsilat ve mesaj hacmini dönemsel kartlarda görün.',
		status: 'kod-hazir',
		released_at: '2026-07-20',
		version: '0.1.0'
	},
	{
		id: 'real-roas',
		module: 'Raporlama',
		title: 'Gerçek ROAS raporu',
		description:
			'Reklam harcamanızı dönem tahsilatıyla kıyaslayın; hasta başına maliyet ve kaynak kırılımı.',
		status: 'kod-hazir',
		released_at: '2026-07-22',
		version: '0.3.0'
	},
	{
		id: 'truth-calculator',
		module: 'Pazarlama',
		title: 'Gerçek ROAS hesabı',
		description:
			'Platform ROAS’ını katkı payı ve maliyetlerle gerçek kâra çevirin; başabaş ve hasta başı reklam tavanını görün.',
		status: 'kod-hazir',
		released_at: '2026-07-22',
		version: '0.2.0'
	},
	{
		id: 'ad-simulator',
		module: 'Pazarlama',
		title: 'Reklam matematiği simülatörü',
		description:
			'CPC, dönüşüm ve satış oranıyla satış başı maliyet, trafik ışığı ve ölçek tavanını hesaplayın.',
		status: 'kod-hazir',
		released_at: '2026-07-22',
		version: '0.2.0'
	},
	{
		id: 'ad-compliance',
		module: 'Pazarlama',
		title: 'Reklam uyumluluk taraması',
		description:
			'Reklam veya landing metnindeki yasaklı / riskli sağlık vaatlerini tarayın.',
		status: 'kod-hazir',
		released_at: '2026-07-22',
		version: '0.2.0'
	},
	{
		id: 'marketing-templates',
		module: 'Pazarlama',
		title: 'UTM ve bütçe şablonları',
		description:
			'UTM linki üretin; 3:2:2 kreatif ve 60/30/10 bütçe bölüşümünü hızlıca çıkarın.',
		status: 'kod-hazir',
		released_at: '2026-07-22',
		version: '0.2.0'
	},
	{
		id: 'trust-score',
		module: 'Pazarlama',
		title: 'Ölçüm olgunluğu (Trust Score)',
		description:
			'Consent, CAPI, enhanced conversions ve CRM geri bildirim checklist’iyle ölçüm skorunu görün.',
		status: 'kod-hazir',
		released_at: '2026-07-22',
		version: '0.2.0'
	},
	{
		id: 'campaign-precheck',
		module: 'Pazarlama',
		title: 'Yayın öncesi kontrol',
		description:
			'Kampanyayı yayınlamadan önce uyumluluk, birim ekonomi ve ölçüm eşiğini tek ekranda kontrol edin.',
		status: 'kod-hazir',
		released_at: '2026-07-22',
		version: '0.4.0'
	},
	{
		id: 'duplicate-scan',
		module: 'Hasta Takibi',
		title: 'Kişi ve hasta çift kayıt',
		description:
			'Telefon, e-posta veya ada göre mükerrerleri tarayın; kayıtları birleştirin.',
		status: 'kod-hazir',
		released_at: '2026-07-20',
		version: '0.1.0'
	},
	{
		id: 'multi-tenant',
		module: 'Platform',
		title: 'Çok kiracılı organizasyon',
		description:
			'Her klinik/acente kendi verisini görür; ekip rolleriyle erişim sınırlanır.',
		status: 'kod-hazir'
	},
	{
		id: 'free-ai-scorecard',
		module: 'Platform',
		title: 'Ücretsiz yapay zeka karnesi',
		description:
			'Üyeliksiz 5 dakikalık karne: kliniğin yapay zeka hazırlığında kanıtı olmayan alanları net cümlelerle görün.',
		status: 'yayinda',
		released_at: '2026-07-30',
		version: '0.5.0'
	},
	{
		id: 'in-product-scorecard',
		module: 'Platform',
		title: 'Ürün içi yapay zeka karnesi',
		description:
			'Tenant ölçüm profili, 43 kriter, otomatik dolum ve ölçüm karşılaştırması — panel /scorecard.',
		status: 'kod-hazir',
		released_at: '2026-07-30',
		version: '0.6.0'
	}
];
