/**
 * `yakinda` (2026-08-24): **kararı verilmiş ama henüz yazılmamış** iş.
 *
 * Sınır önemli — buraya yalnız `docs/2026-08-11-YAPILACAKLAR.md`'de kalemi olan işler
 * girer. `docs/FIKIRLER.md`'deki fikirler **girmez**: orası kararı verilmemiş defterdir
 * ve müşteriye görünen bir "Yakında" listesi taahhüt anlamına gelir. Fikri taahhüde
 * çevirmek, FIKIRLER'in var olma sebebini ortadan kaldırır.
 */
export type FeatureStatus =
	| 'kod-hazir'
	| 'pilotta'
	| 'yayinda'
	| 'harici-onay-bekliyor'
	| 'yakinda';

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
	/**
	 * Panel içi rota — kart buradan açılır. Yoksa kart yalnız açıklayıcıdır.
	 *
	 * **Neden eklendi (2026-08-24):** özellik listede görünüyor ama kullanıcı nereden
	 * açacağını bilmiyordu. "Listelenmiş" ile "tanıtılmış" arasındaki fark buydu.
	 * Public/vitrin yüzeyleri ve tek ekranı olmayan altyapı kalemleri route taşımaz.
	 */
	route?: string;
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
	// --- Aşağıdakiler `docs/FIKIRLER.md`'den gelir: kararı VERİLMEMİŞ fikirler. -------
	// Açıklamaları bilinçli olarak taahhüt dili taşımaz ("olabilir", "değerlendiriliyor"),
	// çünkü fikri söze çevirmek FIKIRLER defterinin var olma sebebini ortadan kaldırır.
	// Yapılmasına karar verilirse YAPILACAKLAR'a kalem olur ve açıklaması netleşir.
	{
		id: 'referral-chain',
		module: 'Raporlama',
		title: 'Referans zinciri',
		description:
			'Bugün doğrudan referans sayılıyor. Getirdiğinizin getirdiğini de sayan zincir görünümü değerlendiriliyor.',
		status: 'yakinda'
	},
	{
		id: 'multi-title',
		module: 'Hasta Takibi',
		title: 'Çok ünvanlı kişi',
		description:
			'Bugün kişi başına tek ünvan var. Aynı kişinin birden çok görevi olabilmesi değerlendiriliyor.',
		status: 'yakinda'
	},
	{
		id: 'incidents-departments',
		module: 'Hasta Takibi',
		title: 'Olay kaydı — diğer departmanlar',
		description:
			'Bugün yalnız klinik sorunları kaydediliyor. Otel, transfer, satış ve reklam türlerinin eklenmesi, klinik döngüsü sahada çalıştıktan sonra değerlendirilecek.',
		status: 'yakinda'
	},
	{
		id: 'maya-voice',
		module: 'Platform',
		title: 'Maya\'ya sesli soru',
		description:
			'Maya bugün yazıyla soruluyor. Sesle sormak değerlendiriliyor; Türkçe ses tanıma kalitesi belirleyici olacak.',
		status: 'yakinda'
	},
	{
		id: 'in-app-notifications',
		module: 'Platform',
		title: 'Panel içi bildirim',
		description:
			'Alarmlar ve müdahale listesi bugün ilgili sayfaya girilince görülüyor. Uyarının kullanıcıyı bulması değerlendiriliyor — eşikler oturmadan açılmayacak.',
		status: 'yakinda'
	},
	{
		id: 'whats-new-surface',
		module: 'Platform',
		title: 'Ürün içi yenilikler',
		description:
			'Panele girildiğinde son eklenenleri gösteren bir yüzey değerlendiriliyor.',
		status: 'yakinda'
	},
	{
		id: 'on-prem',
		module: 'Platform',
		title: 'Yerinde kurulum',
		description:
			'Verisinin hiçbir yere çıkmamasını isteyen klinikler için tek kutu kurulum değerlendiriliyor.',
		status: 'yakinda'
	},
	// --- Buradan aşağısı YAPILACAKLAR'da kalemi olan, kararı VERİLMİŞ işler. ---------
	{
		id: 'maya-open-questions',
		module: 'Platform',
		title: 'Maya — akla gelen her soru',
		description:
			'Maya bugün beş sabit soruyu cevaplıyor; kısıtlı sorgu katmanıyla kayıtlarla ilgili serbest soruları da cevaplayacak.',
		status: 'yakinda'
	},
	{
		id: 'ai-learning-loop',
		module: 'Platform',
		title: 'AI öğrenme döngüsü',
		description:
			'Düzeltmeleriniz zaten kaydediliyor ve raporlanıyor; rapordan doğrudan AI notunu güncelleyebileceğiniz adım eklenecek.',
		status: 'yakinda'
	},
	{
		id: 'suggestion-whitelist',
		module: 'Randevu',
		title: 'Öneri alanlarının genişlemesi',
		description:
			'AI bugün yalnız randevu tarihi için öneri üretiyor; ölçüm sonrası telefon ve randevu durumu gibi alanlar da kapsama girecek.',
		status: 'yakinda'
	},
	{
		id: 'ai-knowledge-base',
		module: 'WhatsApp',
		title: 'Bilgi bankası',
		description:
			'Hizmetler, fiyatlar, ödeme kuralları ve red gerekçeleri Ayarlar’dan giriliyor; WhatsApp ayrıştırması ve Maya bu bilgiden besleniyor. Değişiklikler sürümleniyor.',
		status: 'kod-hazir',
		route: '/settings/knowledge'
	},
	{
		id: 'ai-record-suggestions',
		module: 'Randevu',
		title: 'Randevu güncelleme onay kuyruğu',
		description:
			'WhatsApp mesajından çıkan randevu tarihi değişikliği öneri olarak kuyruğa düşer; her kart tek tek onaylanır, toplu onay yoktur. Eşleşme belirsizse öneri üretilmez.',
		status: 'kod-hazir',
		route: '/appointments/suggestions'
	},
	{
		id: 'ai-operation-alerts',
		module: 'Randevu',
		title: 'Operasyon alarmları',
		description:
			'Uçuş ve transfer gibi zaman kilitli kalemler için eşiğe gelindiğinde uyarı üretilir. Deterministik kod — yapay zekâ değil.',
		status: 'kod-hazir',
		route: '/appointments/alerts'
	},
	{
		id: 'ai-evidence',
		module: 'WhatsApp',
		title: 'Taslakta kaynak izi',
		description:
			'Taslaktaki her alan hangi cümleden çıktığını taşır; kaynak rozetine tıklayınca mesajda alıntı vurgulanır. Uydurma alıntı sunucuda düşürülür.',
		status: 'kod-hazir',
		route: '/finance/ai-transaction'
	},
	{
		id: 'ai-accuracy',
		module: 'Raporlama',
		title: 'AI isabet ölçümü',
		description:
			'Taslakların ne kadarı dokunulmadan onaylandı, hangi alan en çok düzeltiliyor, Maya neyi cevaplayamıyor. Cevaplanamayan sorular bilgi bankası yönlendirmesiyle gösterilir.',
		status: 'kod-hazir',
		route: '/reports/ai-accuracy'
	},
	{
		id: 'maya-live-data',
		module: 'Platform',
		title: 'Maya canlı veri',
		description:
			'Maya bakiye, açık alacak, randevu, dönem özeti ve temassız kişiler sorularını canlı veriden cevaplar. Rakamı veritabanı verir, model yalnız hangi sorgunun çalışacağını seçer; izin araç başına kontrol edilir.',
		status: 'kod-hazir',
		route: '/maya'
	},
	{
		id: 'llm-cost-tracking',
		module: 'Platform',
		title: 'LLM maliyet takibi',
		description:
			'Platform yöneticisi tenant başına LLM çağrı sayısı, token ve maliyeti görür; fallback oranı yüksekse renkli işaretle uyarır.',
		status: 'kod-hazir',
		route: '/dev'
	},
	{
		id: 'contact-titles',
		module: 'Hasta Takibi',
		title: 'Kişi ünvanları',
		description:
			'Hekim, koordinatör, satış, reklam uzmanı gibi görev etiketleri; liste Ayarlar’dan yönetilir. Ünvan tanımlayıcıdır, yetkiyi değiştirmez.',
		status: 'kod-hazir',
		route: '/settings/contact-titles'
	},
	{
		id: 'appointment-doctor',
		module: 'Randevu',
		title: 'Randevuda hekim',
		description:
			'Randevuya hekim atanır; randevu metrikleri hekim kırılımı ve hekim × randevu tipi çapraz sayımı döndürür (RPT oranı buradan hesaplanır).',
		status: 'kod-hazir',
		route: '/appointments'
	},
	{
		id: 'incidents',
		module: 'Hasta Takibi',
		title: 'Olay kaydı',
		description:
			'Hasta dosyasından tek tıkla açılan sorun kaydı: revizyon gerekti, komplikasyon, süreç gecikmesi. Opsiyonel maliyet ve randevu bağı taşır, çözüldü olarak kapatılır. v1 yalnız klinik departmanı.',
		status: 'kod-hazir',
		route: '/settings/incident-types'
	},
	{
		id: 'referral-value',
		module: 'Raporlama',
		title: 'Referans değeri',
		description:
			'Kim kaç kişi getirdi, o kişilerden ne kazanıldı, referans verenin ünvanı ve koordinatörü kim. Rakamlar kişi kartındaki finans özetiyle aynı kaynaktan gelir.',
		status: 'kod-hazir',
		route: '/reports/referrals'
	},
	{
		id: 'report-compare',
		module: 'Raporlama',
		title: 'Dönem karşılaştırması',
		description:
			'Özet ve randevu metrikleri önceki dönemle karşılaştırılır. Önceki dönem aynı gün sayısında ve hemen öncesinde biten penceredir; az kayda dayanan değişimde yüzde gösterilmez.',
		status: 'kod-hazir',
		route: '/reports'
	},
	{
		id: 'interventions',
		module: 'Raporlama',
		title: 'Müdahale listesi',
		description:
			'Kötüleşen hekim oranları, düşen dönem geliri, çözülmemiş olaylar ve en değerli referanslar tek listede — sistem kimse sormadan işaretler. Cümleler şablon, rakamlar SQL; dil modeli hiçbir bulgu üretmez.',
		status: 'kod-hazir',
		route: '/reports/interventions'
	},
	{
		id: 'campaign-assistant',
		module: 'Pazarlama',
		title: 'Kampanya Asistanı',
		description:
			'Pazarlama hub’ı — gerçek ROAS hesabı, simülatör, uyumluluk taraması ve yayın öncesi kontrolleri tek yerde.',
		status: 'kod-hazir',
		route: '/marketing',
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
		route: '/contacts',
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
		route: '/appointments',
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
		route: '/finance',
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
		route: '/finance/ai-transaction',
		released_at: '2026-07-20',
		version: '0.1.0'
	},
	{
		id: 'ghl-sync',
		module: 'Entegrasyonlar',
		title: 'GoHighLevel senkronu',
		description:
			'GHL lead ve fırsatlarını alan bazlı sahiplik kurallarıyla Verimaya ile eşleştirin.',
		status: 'kod-hazir',
		route: '/settings/connections/ghl'
	},
	{
		id: 'ads-metrics',
		module: 'Entegrasyonlar',
		title: 'Meta ve Google Ads metrikleri',
		description:
			'Reklam harcaması ve dönüşümleri günlük özet olarak panele çekin.',
		status: 'harici-onay-bekliyor',
		route: '/settings/connections/ads'
	},
	{
		id: 'ads-connect',
		module: 'Entegrasyonlar',
		title: 'Meta & Google Ads bağlantısı',
		description:
			'Reklam hesabınızı bağlayın; kampanya harcaması günlük çekilir ve Gerçek ROAS raporunu besler.',
		status: 'harici-onay-bekliyor',
		route: '/settings/connections/ads'
	},
	{
		id: 'n8n-api',
		module: 'Entegrasyonlar',
		title: 'n8n ve dış API',
		description:
			'Scope’lu API anahtarı ve imzalı webhook’larla otomasyonları bağlayın.',
		status: 'kod-hazir',
		route: '/settings/connections/api',
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
		route: '/reports',
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
		route: '/reports',
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
		route: '/marketing/calculator',
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
		route: '/marketing/simulator',
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
		route: '/marketing/compliance',
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
		route: '/marketing/templates',
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
		route: '/marketing/measurement',
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
		route: '/marketing/pre-launch',
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
		route: '/contacts/duplicates',
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
		route: '/scorecard',
		released_at: '2026-07-30',
		version: '0.6.0'
	}
];
