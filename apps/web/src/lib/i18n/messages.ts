/**
 * Mesaj kataloğu — i18n tek kaynağı.
 *
 * Kural (docs/TASARIM.md § Dil ve slug):
 * - Rota, API yolu ve kod tanımlayıcıları **İngilizce**; kullanıcıya görünen metin buradan gelir.
 * - `tr` kataloğu tip kaynağıdır. Yeni bir anahtar `tr`'ye eklenip `en`'e eklenmezse **derleme hatası** alınır.
 * - Bugün yalnızca `tr` yayında (bkz. defaultLocale). `en` altyapı hazır olsun diye doldurulur.
 *
 * Mesaj sayısı büyüyünce (kabaca 300+ anahtar) bu modül Paraglide/inlang ile değiştirilebilir;
 * `t()` imzası aynı kaldığı sürece çağıran taraf etkilenmez.
 */

export const locales = ['tr', 'en'] as const;
export type Locale = (typeof locales)[number];

/** Yayındaki tek dil. Değiştirmeden önce docs/TASARIM.md § Dil ve slug'a bak. */
export const defaultLocale: Locale = 'tr';

const tr = {
	// Panel navigasyonu — grup başlıkları
	'nav.group.main': 'Ana',
	'nav.group.finance': 'Finans',
	'nav.group.marketing': 'Pazarlama',
	'nav.group.system': 'Sistem',

	// Panel navigasyonu — bağlantılar
	'nav.dashboard': 'Panel',
	'nav.patients': 'Hastalar',
	'nav.contacts': 'Kişiler',
	'nav.appointments': 'Randevular',
	'nav.transactions': 'İşlemler',
	'nav.balances': 'Bakiyeler',
	'nav.reports': 'Raporlar',
	'nav.marketingOverview': 'Genel Bakış',
	'nav.calculator': 'Hesap',
	'nav.simulator': 'Simülatör',
	'nav.compliance': 'Uyumluluk',
	'nav.templates': 'Şablonlar',
	'nav.measurement': 'Ölçüm',
	'nav.preLaunch': 'Yayın Öncesi',
	'nav.settings': 'Ayarlar',
	'nav.features': 'Özellikler',
	'nav.changelog': 'Yenilikler',
	'nav.developer': 'Geliştirici',

	// Ayarlar · AI
	'settings.ai.title': 'AI ayarları',
	'settings.ai.description':
		'WhatsApp AI şeffaflığı (EU AI Act m.50, 2 Ağustos 2026) ve demo sistem prompt’u.',
	'settings.ai.disclosure.heading': 'WhatsApp AI ifşa metni',
	'settings.ai.disclosure.why':
		'Otomatik veya AI destekli giden mesajlarda alıcıya yapay zekâ kullanımı bildirilmelidir. Bu ayar karne kriteri 7.6’yı besler; metin giden yolda (Adım 24) uygulanır.',
	'settings.ai.disclosure.enabled': 'İfşa metnini giden AI mesajlarına ekle',
	'settings.ai.disclosure.textLabel': 'İfşa metni',
	'settings.ai.disclosure.save': 'İfşayı kaydet',
	'settings.ai.disclosure.saving': 'Kaydediliyor…',
	'settings.ai.disclosure.saved': 'Kaydedildi.',
	'settings.ai.disclosure.error': 'Kayıt başarısız.',
	'settings.ai.disclosure.loadError': 'Ayar yüklenemedi.',
	'settings.ai.prompt.label': 'Prompt',
	'settings.ai.prompt.default': 'varsayılan',
	'settings.ai.prompt.save': 'Kaydet',
	'settings.ai.prompt.reset': 'Varsayılana dön',
	'settings.ai.prompt.saved': 'Kaydedildi.',
	'settings.ai.prompt.footnote':
		'Prompt demo: localStorage. Gerçek tenant prompt’u ayrı iş; ifşa ayarı API’de saklanır.'
} as const;

export type MessageKey = keyof typeof tr;

const en: Record<MessageKey, string> = {
	'nav.group.main': 'Main',
	'nav.group.finance': 'Finance',
	'nav.group.marketing': 'Marketing',
	'nav.group.system': 'System',

	'nav.dashboard': 'Dashboard',
	'nav.patients': 'Patients',
	'nav.contacts': 'Contacts',
	'nav.appointments': 'Appointments',
	'nav.transactions': 'Transactions',
	'nav.balances': 'Balances',
	'nav.reports': 'Reports',
	'nav.marketingOverview': 'Overview',
	'nav.calculator': 'Calculator',
	'nav.simulator': 'Simulator',
	'nav.compliance': 'Compliance',
	'nav.templates': 'Templates',
	'nav.measurement': 'Measurement',
	'nav.preLaunch': 'Pre-launch',
	'nav.settings': 'Settings',
	'nav.features': 'Features',
	'nav.changelog': "What's new",
	'nav.developer': 'Developer',

	'settings.ai.title': 'AI settings',
	'settings.ai.description':
		'WhatsApp AI transparency (EU AI Act Art. 50, 2 Aug 2026) and demo system prompt.',
	'settings.ai.disclosure.heading': 'WhatsApp AI disclosure',
	'settings.ai.disclosure.why':
		'Automated or AI-assisted outbound messages must disclose AI use to the recipient. This setting feeds scorecard criterion 7.6; the text is applied on the outbound path (step 24).',
	'settings.ai.disclosure.enabled': 'Append disclosure to outbound AI messages',
	'settings.ai.disclosure.textLabel': 'Disclosure text',
	'settings.ai.disclosure.save': 'Save disclosure',
	'settings.ai.disclosure.saving': 'Saving…',
	'settings.ai.disclosure.saved': 'Saved.',
	'settings.ai.disclosure.error': 'Save failed.',
	'settings.ai.disclosure.loadError': 'Could not load setting.',
	'settings.ai.prompt.label': 'Prompt',
	'settings.ai.prompt.default': 'default',
	'settings.ai.prompt.save': 'Save',
	'settings.ai.prompt.reset': 'Reset to default',
	'settings.ai.prompt.saved': 'Saved.',
	'settings.ai.prompt.footnote':
		'Prompt is demo localStorage. Real tenant prompt is separate; disclosure is stored via API.'
};

export const messages: Record<Locale, Record<MessageKey, string>> = { tr, en };
