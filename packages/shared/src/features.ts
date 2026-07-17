export type FeatureStatus = 'yayinda' | 'gelistiriliyor' | 'planlandi';

export type FeatureModule =
	| 'Hasta Takibi'
	| 'Randevu'
	| 'Finans'
	| 'WhatsApp'
	| 'Entegrasyonlar'
	| 'Raporlama'
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
 * Tek kaynak: /ozellikler sayfası buradan render edilir.
 * "Yayında"ya geçen özellik aynı commit'te changelog.ts'e de yazılır.
 */
export const features: Feature[] = [
	{
		id: 'patients-list',
		module: 'Hasta Takibi',
		title: 'Hasta listesi ve detay',
		description:
			'Lead ve hasta kayıtlarını listeleyin, durumlarını takip edin, not ve iletişim bilgilerine tek ekrandan ulaşın.',
		status: 'gelistiriliyor'
	},
	{
		id: 'appointments-calendar',
		module: 'Randevu',
		title: 'Randevu takvimi',
		description:
			'Klinik, otel ve transfer notlarıyla birlikte randevuları gün/hafta görünümünde yönetin.',
		status: 'gelistiriliyor'
	},
	{
		id: 'finance-ledger',
		module: 'Finans',
		title: 'Gelir-gider işlemleri',
		description:
			'Tahsilat ve ödemeleri hasta bağlantısı, ödeme durumu ve fatura bilgisiyle kaydedin.',
		status: 'gelistiriliyor'
	},
	{
		id: 'whatsapp-inbox',
		module: 'WhatsApp',
		title: 'WhatsApp Inbox',
		description:
			'Gelen mesajları tek panelde okuyun; AI çıkarımları onayınız olmadan kayda yazılmaz.',
		status: 'planlandi'
	},
	{
		id: 'ghl-sync',
		module: 'Entegrasyonlar',
		title: 'GoHighLevel senkronu',
		description:
			'GHL lead ve fırsatlarını alan bazlı sahiplik kurallarıyla Verimaya ile eşleştirin.',
		status: 'planlandi'
	},
	{
		id: 'ads-metrics',
		module: 'Entegrasyonlar',
		title: 'Meta ve Google Ads metrikleri',
		description:
			'Reklam harcaması ve dönüşümleri günlük özet olarak panele çekin.',
		status: 'planlandi'
	},
	{
		id: 'n8n-api',
		module: 'Entegrasyonlar',
		title: 'n8n ve dış API',
		description:
			'Scope’lu API anahtarı ve imzalı webhook’larla otomasyonları bağlayın.',
		status: 'planlandi'
	},
	{
		id: 'reports-dashboard',
		module: 'Raporlama',
		title: 'Özet raporlar ve dashboard',
		description:
			'Lead, dönüşüm, tahsilat ve mesaj hacmini dönemsel kartlarda görün.',
		status: 'gelistiriliyor'
	},
	{
		id: 'multi-tenant',
		module: 'Platform',
		title: 'Çok kiracılı organizasyon',
		description:
			'Her klinik/acente kendi verisini görür; ekip rolleriyle erişim sınırlanır.',
		status: 'planlandi'
	}
];
