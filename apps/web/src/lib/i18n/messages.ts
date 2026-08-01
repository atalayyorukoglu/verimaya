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
	'nav.scorecard': 'Karne',
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
		'WhatsApp AI şeffaflığı (EU AI Act m.50) ve demo sistem prompt’u. İfşa metni giden AI mesajlarına eklenecek.',
	'settings.ai.disclosure.heading': 'WhatsApp AI ifşa metni',
	'settings.ai.disclosure.why':
		'EU AI Act m.50 gereği AI destekli giden mesajlarda alıcı bilgilendirilmelidir. Bu ayar karne kriteri 7.6’yı besler. Giden gönderim yolu henüz bağlı değil; metin giden AI mesajlarına eklenecek.',
	'settings.ai.disclosure.enabled': 'Giden AI mesajlarına ifşa metni eklenecek',
	'settings.ai.disclosure.textLabel': 'İfşa metni',
	'settings.ai.disclosure.save': 'İfşayı kaydet',
	'settings.ai.disclosure.saving': 'Kaydediliyor…',
	'settings.ai.disclosure.saved': 'Kaydedildi.',
	'settings.ai.disclosure.error': 'Kayıt başarısız.',
	'settings.ai.disclosure.loadError': 'Ayar yüklenemedi.',
	'settings.ai.disclosure.note':
		'Gerçek WhatsApp gönderimi henüz yok. Port + ifşa hook’u hazır; gönderim ayrı karardır.',
	'settings.ai.prompt.label': 'Prompt',
	'settings.ai.prompt.default': 'varsayılan',
	'settings.ai.prompt.save': 'Kaydet',
	'settings.ai.prompt.reset': 'Varsayılana dön',
	'settings.ai.prompt.saved': 'Kaydedildi.',
	'settings.ai.prompt.footnote':
		'Prompt demo: localStorage. Gerçek tenant prompt’u ayrı iş; ifşa ayarı API’de saklanır.',

	// Ürün içi karne (Adım 36)
	'scorecard.title': 'Yapay zeka karnesi',
	'scorecard.description':
		'Kurum içi ölçüm — ücretsiz karneden ayrıdır. Birincil gösterge kapanan / kalan sıfırlar.',
	'scorecard.loading': 'Karne yükleniyor…',
	'scorecard.loadError': 'Karne yüklenemedi.',
	'scorecard.setup.title': 'Profil oluştur',
	'scorecard.setup.band': 'Ekip büyüklüğü',
	'scorecard.setup.s1': 'Orta kademe yöneticiniz var mı?',
	'scorecard.setup.s2': 'Ayrı departman / fonksiyonlarınız var mı?',
	'scorecard.setup.s3': 'Yazılı süreç dokümanlarınız var mı?',
	'scorecard.setup.yes': 'Evet',
	'scorecard.setup.no': 'Hayır',
	'scorecard.setup.create': 'Profili oluştur ve ölçüme başla',
	'scorecard.setup.creating': 'Oluşturuluyor…',
	'scorecard.zeros.heading': 'Sıfırlar',
	'scorecard.zeros.primary': '{zeros} sıfır · {denom} geçerli kriter',
	'scorecard.zeros.hint':
		'Birincil gösterge budur. İkinci ölçümde “kaç sıfır kapandı” karşılaştırması burada görünür.',
	'scorecard.percentage.label': 'Yüzde',
	'scorecard.percentage.warning':
		'Farklı ölçek bantlarının yüzdeleri birbiriyle kıyaslanmaz. Bu yüzde yalnızca kendi önceki ölçümünüzle karşılaştırmak içindir.',
	'scorecard.maturity.baslangic': 'Başlangıç',
	'scorecard.maturity.parcali': 'Parçalı',
	'scorecard.maturity.tutarli': 'Tutarlı',
	'scorecard.maturity.olgun': 'Olgun',
	'scorecard.maturity.temporary':
		'Olgunluk eşikleri geçicidir; saha testinden önce kesinleşmez.',
	'scorecard.headcount': 'Ölçek bandı',
	'scorecard.autoFill': 'Sistem cevaplarını doldur',
	'scorecard.autoFilling': 'Dolduruluyor…',
	'scorecard.autoFilledBadge': 'Otomatik',
	'scorecard.naBadge': 'N/A beyan',
	'scorecard.complete': 'Ölçümü tamamla',
	'scorecard.completing': 'Tamamlanıyor…',
	'scorecard.startAssessment': 'Ölçüme başla',
	'scorecard.disclosureLink': 'İfşa ayarını aç',
	'scorecard.scoreLabel': 'Puan (0–4)',
	'scorecard.baselineWarning': 'Başlangıç ölçümü — önceki skorla kıyaslanamaz.',
	'scorecard.dimension.changeHeading': 'Boyutlar',
	'scorecard.dimension.zeros': '{zeros}/{scored} sıfır',
	'scorecard.emptyAnswers': 'Henüz cevap yok — otomatik doldur veya satırdan puan ver.',
	'scorecard.newMeasurement': 'Yeni ölçüm başlat',
	'scorecard.compare.link': 'Ölçümleri karşılaştır',
	'scorecard.compare.title': 'Ölçüm karşılaştırması',
	'scorecard.compare.description': 'Aynı profildeki iki tamamlanmış ölçüm — birincil gösterge kapanan sıfırlar.',
	'scorecard.compare.primary': '{prev} sıfırdan {closed} kapandı',
	'scorecard.compare.blocked': 'Kıyaslama yapılamıyor',
	'scorecard.compare.back': 'Karneye dön',
	'scorecard.compare.closedBadge': 'Sıfır kapandı',
	'scorecard.compare.loading': 'Karşılaştırma yükleniyor…',
	'scorecard.compare.loadError': 'Karşılaştırma yüklenemedi.',
	'scorecard.history.heading': 'Arşivlenen ölçümler',
	'scorecard.history.row': '{date} · {zeros} sıfır · {pct}',

	'settings.ghl.title': 'GoHighLevel',
	'settings.ghl.description':
		'Lead ve iletişim senkronu — webhook-first, alan sahipliği kurallı.',
	'settings.ghl.card.name': 'GHL hesabı',
	'settings.ghl.card.description':
		"Contact ve opportunity webhook'ları kuyruğa yazılır, worker'da işlenir; Verimaya sahibi olduğu alanları GHL'e geri yazar.",
	'settings.ghl.connect': "GHL'e bağlan",
	'settings.ghl.flash': 'GHL bağlantısı tamamlandı.',
	'settings.ghl.statusLabel': 'Durum',
	'settings.ghl.statusConnected': 'Bağlı',
	'settings.ghl.statusDisconnected': 'Bağlı değil',
	'settings.ghl.locationLabel': 'Location',
	'settings.ghl.userTypeLabel': 'Token tipi',
	'settings.ghl.keyVersionLabel': 'Anahtar sürümü',
	'settings.ghl.loading': 'Bağlantı durumu yükleniyor…',
	'settings.ghl.loadError': 'Bağlantı durumu yüklenemedi.',
	'settings.ghl.disconnectError': 'Bağlantı kesilemedi',
	'settings.ghl.ownership.heading': 'Alan sahipliği (planlanan)',
	'settings.ghl.ownership.lead': 'Lead durumu ve pipeline aşaması: GHL sahibi',
	'settings.ghl.ownership.ops': 'Randevu, finans ve operasyon alanları: Verimaya sahibi',
	'settings.ghl.ownership.conflict': 'Çakışmada kaynak sahibi kazanır, olay denetim kaydına düşer.',
	'settings.ghl.dev.heading': 'Geliştirme / fixture',
	'settings.ghl.dev.body':
		"OAuth olmadan gelen GHL webhook'ları kuyrukta işlenir; contact alanları yeterliyse tenant içinde hasta upsert edilir (source=ghl). Sync özeti jobs ledger'ına yazılır. 6 saatlik ghl.reconcile için ENABLE_INTEGRATION_SCHEDULERS=true gerekir.",
	'settings.ghl.footnote':
		'Token AES-GCM ile saklanır. Refresh Adım 41 HTTP istemcisinde kullanılır; access ~24s, refresh kullanıma kadar ~1 yıl.',

	'settings.ads.title': 'Reklamlar',
	'settings.ads.description':
		'Meta ve Google Ads harcama/lead verisi — kampanya bazında maliyet raporları için.',
	'settings.ads.flash': '{provider} bağlantısı tamamlandı.',
	'settings.ads.meta.name': 'Meta Ads',
	'settings.ads.meta.description':
		'Lead form gönderimlerini webhook ile alır; kampanya harcamasını günlük çeker ve hasta kaynağıyla eşler.',
	'settings.ads.google.name': 'Google Ads',
	'settings.ads.google.description':
		'Kampanya harcaması ve dönüşüm verisini çeker; offline conversion geri bildirimi planlanıyor.',
	'settings.ads.connectMeta': "Meta'ya bağlan",
	'settings.ads.connectGoogle': "Google'a bağlan",
	'settings.ads.statusLabel': 'Durum',
	'settings.ads.statusConnected': 'Bağlı',
	'settings.ads.statusDisconnected': 'Bağlı değil',
	'settings.ads.lastSyncLabel': 'Son senkron',
	'settings.ads.keyVersionLabel': 'Anahtar sürümü',
	'settings.ads.loading': 'Bağlantı durumu yükleniyor…',
	'settings.ads.loadError': 'Bağlantı durumu yüklenemedi.',
	'settings.ads.disconnectError': 'Bağlantı kesilemedi',
	'settings.ads.sync': 'Metrikleri şimdi çek',
	'settings.ads.syncing': 'Çekiliyor…',
	'settings.ads.syncOk': 'Senkron tamam: {count} satır ({mode}).',
	'settings.ads.syncError': 'Senkron başarısız.',
	'settings.ads.syncHint':
		'Otomatik zamanlayıcı kapalıdır. Veriler yalnızca bu düğmeyle çekilir.',
	'settings.ads.dev.heading': 'Geliştirme / demo verisi',
	'settings.ads.dev.body':
		'OAuth yokken senkron örnek satır yazar. Otomatik 6s kuyruk için ENABLE_INTEGRATION_SCHEDULERS=true gerekir — prod’da kapalı tutuyoruz.',
	'settings.ads.footnote':
		'Bağlantı sonrası "hasta başına maliyet" Raporlar sayfasında kaynak bazında görünecek.'
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
	'nav.scorecard': 'Scorecard',
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
		'WhatsApp AI transparency (EU AI Act Art. 50) and demo system prompt. Disclosure will be added to outbound AI messages.',
	'settings.ai.disclosure.heading': 'WhatsApp AI disclosure',
	'settings.ai.disclosure.why':
		'EU AI Act Art. 50 requires recipients to be informed about AI-assisted outbound messages. This setting feeds scorecard criterion 7.6. Outbound delivery is not wired yet; the text will be prepended to outbound AI messages.',
	'settings.ai.disclosure.enabled': 'Disclosure text will be added to outbound AI messages',
	'settings.ai.disclosure.textLabel': 'Disclosure text',
	'settings.ai.disclosure.save': 'Save disclosure',
	'settings.ai.disclosure.saving': 'Saving…',
	'settings.ai.disclosure.saved': 'Saved.',
	'settings.ai.disclosure.error': 'Save failed.',
	'settings.ai.disclosure.loadError': 'Could not load setting.',
	'settings.ai.disclosure.note':
		'Real WhatsApp send is not available yet. Port + disclosure hook are ready; shipping send is a separate decision.',
	'settings.ai.prompt.label': 'Prompt',
	'settings.ai.prompt.default': 'default',
	'settings.ai.prompt.save': 'Save',
	'settings.ai.prompt.reset': 'Reset to default',
	'settings.ai.prompt.saved': 'Saved.',
	'settings.ai.prompt.footnote':
		'Prompt is demo localStorage. Real tenant prompt is separate; disclosure is stored via API.',

	'scorecard.title': 'AI scorecard',
	'scorecard.description':
		'In-product assessment — separate from the free public scorecard. Primary signal is zeros closed / remaining.',
	'scorecard.loading': 'Loading scorecard…',
	'scorecard.loadError': 'Could not load scorecard.',
	'scorecard.setup.title': 'Create profile',
	'scorecard.setup.band': 'Team size',
	'scorecard.setup.s1': 'Do you have middle managers?',
	'scorecard.setup.s2': 'Do you have separate departments / functions?',
	'scorecard.setup.s3': 'Do you have written process documents?',
	'scorecard.setup.yes': 'Yes',
	'scorecard.setup.no': 'No',
	'scorecard.setup.create': 'Create profile and start assessment',
	'scorecard.setup.creating': 'Creating…',
	'scorecard.zeros.heading': 'Zeros',
	'scorecard.zeros.primary': '{zeros} zeros · {denom} applicable criteria',
	'scorecard.zeros.hint':
		'This is the primary signal. On the second measurement, “how many zeros closed” will appear here.',
	'scorecard.percentage.label': 'Percentage',
	'scorecard.percentage.warning':
		'Percentages across headcount bands are not comparable. This percentage is only for comparing with your own prior measurement.',
	'scorecard.maturity.baslangic': 'Starting',
	'scorecard.maturity.parcali': 'Partial',
	'scorecard.maturity.tutarli': 'Consistent',
	'scorecard.maturity.olgun': 'Mature',
	'scorecard.maturity.temporary':
		'Maturity thresholds are temporary until field testing.',
	'scorecard.headcount': 'Headcount band',
	'scorecard.autoFill': 'Fill system-known answers',
	'scorecard.autoFilling': 'Filling…',
	'scorecard.autoFilledBadge': 'Auto',
	'scorecard.naBadge': 'N/A declared',
	'scorecard.complete': 'Complete assessment',
	'scorecard.completing': 'Completing…',
	'scorecard.startAssessment': 'Start assessment',
	'scorecard.disclosureLink': 'Open disclosure settings',
	'scorecard.scoreLabel': 'Score (0–4)',
	'scorecard.baselineWarning': 'Baseline measurement — not comparable to prior scores.',
	'scorecard.dimension.changeHeading': 'Dimensions',
	'scorecard.dimension.zeros': '{zeros}/{scored} zeros',
	'scorecard.emptyAnswers': 'No answers yet — auto-fill or score each row.',
	'scorecard.newMeasurement': 'Start new measurement',
	'scorecard.compare.link': 'Compare measurements',
	'scorecard.compare.title': 'Measurement comparison',
	'scorecard.compare.description':
		'Two completed measurements on the same profile — primary signal is zeros closed.',
	'scorecard.compare.primary': '{closed} of {prev} zeros closed',
	'scorecard.compare.blocked': 'Comparison unavailable',
	'scorecard.compare.back': 'Back to scorecard',
	'scorecard.compare.closedBadge': 'Zero closed',
	'scorecard.compare.loading': 'Loading comparison…',
	'scorecard.compare.loadError': 'Could not load comparison.',
	'scorecard.history.heading': 'Archived measurements',
	'scorecard.history.row': '{date} · {zeros} zeros · {pct}',

	'settings.ghl.title': 'GoHighLevel',
	'settings.ghl.description':
		'Lead and contact sync — webhook-first, field ownership rules.',
	'settings.ghl.card.name': 'GHL account',
	'settings.ghl.card.description':
		'Contact and opportunity webhooks are queued and processed by workers; Verimaya writes back fields it owns.',
	'settings.ghl.connect': 'Connect GHL',
	'settings.ghl.flash': 'GHL connection completed.',
	'settings.ghl.statusLabel': 'Status',
	'settings.ghl.statusConnected': 'Connected',
	'settings.ghl.statusDisconnected': 'Not connected',
	'settings.ghl.locationLabel': 'Location',
	'settings.ghl.userTypeLabel': 'Token type',
	'settings.ghl.keyVersionLabel': 'Key version',
	'settings.ghl.loading': 'Loading connection status…',
	'settings.ghl.loadError': 'Could not load connection status.',
	'settings.ghl.disconnectError': 'Could not disconnect',
	'settings.ghl.ownership.heading': 'Field ownership (planned)',
	'settings.ghl.ownership.lead': 'Lead status and pipeline stage: GHL owns',
	'settings.ghl.ownership.ops': 'Appointments, finance, and ops fields: Verimaya owns',
	'settings.ghl.ownership.conflict': 'On conflict the source owner wins; the event is audited.',
	'settings.ghl.dev.heading': 'Development / fixture',
	'settings.ghl.dev.body':
		'GHL webhooks without OAuth are still processed; clean contacts upsert patients (source=ghl). Sync summary goes to the jobs ledger. 6h ghl.reconcile needs ENABLE_INTEGRATION_SCHEDULERS=true.',
	'settings.ghl.footnote':
		'Tokens are stored with AES-GCM. Refresh is used by the Adım 41 HTTP client; access ~24h, refresh ~1y until used.',

	'settings.ads.title': 'Ads',
	'settings.ads.description':
		'Meta and Google Ads spend/lead data — for campaign-level cost reports.',
	'settings.ads.flash': '{provider} connection completed.',
	'settings.ads.meta.name': 'Meta Ads',
	'settings.ads.meta.description':
		'Receives lead form submissions via webhook; pulls daily campaign spend and matches patient sources.',
	'settings.ads.google.name': 'Google Ads',
	'settings.ads.google.description':
		'Pulls campaign spend and conversions; offline conversion feedback is planned.',
	'settings.ads.connectMeta': 'Connect Meta',
	'settings.ads.connectGoogle': 'Connect Google',
	'settings.ads.statusLabel': 'Status',
	'settings.ads.statusConnected': 'Connected',
	'settings.ads.statusDisconnected': 'Not connected',
	'settings.ads.lastSyncLabel': 'Last sync',
	'settings.ads.keyVersionLabel': 'Key version',
	'settings.ads.loading': 'Loading connection status…',
	'settings.ads.loadError': 'Could not load connection status.',
	'settings.ads.disconnectError': 'Could not disconnect',
	'settings.ads.sync': 'Pull metrics now',
	'settings.ads.syncing': 'Pulling…',
	'settings.ads.syncOk': 'Sync done: {count} rows ({mode}).',
	'settings.ads.syncError': 'Sync failed.',
	'settings.ads.syncHint': 'Automatic scheduler is off. Data is pulled only via this button.',
	'settings.ads.dev.heading': 'Development / demo data',
	'settings.ads.dev.body':
		'Without OAuth, sync writes sample rows. Periodic 6h queue needs ENABLE_INTEGRATION_SCHEDULERS=true — we keep it off in prod.',
	'settings.ads.footnote':
		'After connecting, cost-per-patient appears on Reports by source.'
};

export const messages: Record<Locale, Record<MessageKey, string>> = { tr, en };
