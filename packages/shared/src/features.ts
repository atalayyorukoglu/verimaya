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
			'GHL lead ve fırsatlarını alan bazlı sahiplik kurallarıyla Veri Maya ile eşleştirin.',
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
