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

	// Ücretsiz karne — sonuç ve lead kapısı (LEG-01)
	'karne.result.gate.eyebrow': 'Sonuç hazır',
	'karne.result.gate.title': 'Detaylı özeti e-posta ile alın',
	'karne.result.gate.description': 'Karneniz hazır. E-posta bırakırsanız özeti size iletiriz.',
	'karne.result.eyebrow': 'Sonuç',
	'karne.result.zeroSummary': "{total} sorudan {zeros}'inde kanıtınız yok.",
	'karne.result.weakHeading': 'En kritik üçü',
	'karne.result.strongHeading': 'İyi çıkan alan',
	'karne.result.strongRefs.two': '{first} ve {second}',
	'karne.result.strongRefs.many': '{leading} ve {last}',
	'karne.result.strongStatus': "{refs}'te durumunuz iyi:",
	'karne.result.euNoticePrefix':
		"İngiltere/AB'de yaşayan hastalarınız olduğu için yapay zeka şeffaflığı yükümlülüğü",
	'karne.result.euEffectiveDate': '2 Ağustos 2026',
	'karne.result.euNoticeSuffix': "'dan itibaren sizi kapsıyor.",
	'karne.result.productBlurb':
		'Verimaya, hasta yolculuğunu tek panelde toplar — lead\'den randevuya, finanstan WhatsApp aktarımına.',
	'karne.result.backToShowcase': 'Vitrine dön',
	'karne.result.demoLogin': 'Demo için giriş',

	// Ayarlar · AI
	'settings.ai.title': 'AI ayarları',
	'settings.ai.description':
		'WhatsApp AI şeffaflığı (EU AI Act m.50) ve demo sistem prompt\'u. İfşa metni giden AI mesajlarına eklenecek.',
	'settings.ai.disclosure.heading': 'WhatsApp AI ifşa metni',
	'settings.ai.disclosure.why':
		'EU AI Act m.50 gereği AI destekli giden mesajlarda alıcı bilgilendirilmelidir. Bu ayar karne kriteri 7.6\'yı besler. Giden gönderim yolu henüz bağlı değil; metin giden AI mesajlarına eklenecek.',
	'settings.ai.disclosure.enabled': 'Giden AI mesajlarına ifşa metni eklenecek',
	'settings.ai.disclosure.textLabel': 'İfşa metni',
	'settings.ai.disclosure.save': 'İfşayı kaydet',
	'settings.ai.disclosure.saving': 'Kaydediliyor…',
	'settings.ai.disclosure.saved': 'Kaydedildi.',
	'settings.ai.disclosure.error': 'Kayıt başarısız.',
	'settings.ai.disclosure.loadError': 'Ayar yüklenemedi.',
	'settings.ai.disclosure.note':
		'Gerçek WhatsApp gönderimi henüz yok. Port + ifşa hook\'u hazır; gönderim ayrı karardır.',
	'settings.ai.prompt.label': 'Prompt',
	'settings.ai.prompt.default': 'varsayılan',
	'settings.ai.prompt.save': 'Kaydet',
	'settings.ai.prompt.reset': 'Varsayılana dön',
	'settings.ai.prompt.saved': 'Kaydedildi.',
	'settings.ai.prompt.footnote':
		'Prompt demo: localStorage. Gerçek tenant prompt\'u ayrı iş; ifşa ayarı API\'de saklanır.',

	// Ayarlar · Organizasyon
	'settings.organization.timezone': 'Saat dilimi',
	'settings.organization.timezoneHint':
		'Takvim günleri ve randevu filtreleri bu saat dilimine göre hesaplanır.',
	'settings.organization.tzEuropeIstanbul': 'Europe/Istanbul (Türkiye)',
	'settings.organization.tzAsiaRiyadh': 'Asia/Riyadh (Suudi Arabistan)',
	'settings.organization.tzEuropeLondon': 'Europe/London (İngiltere)',
	'settings.organization.tzUtc': 'UTC',

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
		'Birincil gösterge budur. İkinci ölçümde "kaç sıfır kapandı" karşılaştırması burada görünür.',
	'scorecard.percentage.label': 'Yüzde',
	'scorecard.percentage.warning':
		'Farklı ölçek bantlarının yüzdeleri birbiriyle kıyaslanmaz. Bu yüzde yalnızca kendi önceki ölçümünüzle karşılaştırmak içindir.',
	'scorecard.maturity.baslangic': 'Başlangıç',
	'scorecard.maturity.parcali': 'Parçalı',
	'scorecard.maturity.tutarli': 'Tutarlı',
	'scorecard.maturity.olgun': 'Olgun',
	'scorecard.maturity.temporary': 'Olgunluk eşikleri geçicidir; saha testinden önce kesinleşmez.',
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
	'scorecard.scoreOption': 'Puan {score}',
	'scorecard.baselineWarning': 'Başlangıç ölçümü — önceki skorla kıyaslanamaz.',
	'scorecard.dimension.changeHeading': 'Boyutlar',
	'scorecard.dimension.zeros': '{zeros}/{scored} sıfır',
	'scorecard.emptyAnswers': 'Henüz cevap yok — otomatik doldur veya satırdan puan ver.',
	'scorecard.newMeasurement': 'Yeni ölçüm başlat',
	'scorecard.compare.link': 'Ölçümleri karşılaştır',
	'scorecard.compare.title': 'Ölçüm karşılaştırması',
	'scorecard.compare.description':
		'Aynı profildeki iki tamamlanmış ölçüm — birincil gösterge kapanan sıfırlar.',
	'scorecard.compare.primary': '{prev} sıfırdan {closed} kapandı',
	'scorecard.compare.blocked': 'Kıyaslama yapılamıyor',
	'scorecard.compare.back': 'Karneye dön',
	'scorecard.compare.closedBadge': 'Sıfır kapandı',
	'scorecard.compare.loading': 'Karşılaştırma yükleniyor…',
	'scorecard.compare.loadError': 'Karşılaştırma yüklenemedi.',
	'scorecard.history.heading': 'Arşivlenen ölçümler',
	'scorecard.history.row': '{date} · {zeros} sıfır · {pct}',

	'settings.ghl.title': 'GoHighLevel',
	'settings.ghl.description': 'Lead ve iletişim senkronu — webhook-first, alan sahipliği kurallı.',
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
		'Otomatik zamanlayıcı kapalıdır. Bu düğme yaklaşık son 10 yıllık günlük harcamayı çeker; Raporlar yalnızca DB\'deki satırları toplar.',
	'settings.ads.googleCustomerId.label': 'Google Ads müşteri hesap no',
	'settings.ads.googleCustomerId.hint':
		'MCC ile bağlandıysan, metrik çekilecek client hesabın numarasını gir (tire opsiyonel).',
	'settings.ads.googleCustomerId.save': 'Hesap no kaydet',
	'settings.ads.googleCustomerId.saving': 'Kaydediliyor…',
	'settings.ads.googleCustomerId.saved': 'Müşteri hesap no kaydedildi.',
	'settings.ads.googleCustomerId.error': 'Hesap no kaydedilemedi.',
	'settings.ads.dev.heading': 'Geliştirme / demo verisi',
	'settings.ads.dev.body':
		'OAuth yokken senkron örnek satır yazar. Otomatik 6s kuyruk için ENABLE_INTEGRATION_SCHEDULERS=true gerekir — prod\'da kapalı tutuyoruz.',
	'settings.ads.footnote':
		'Bağlantı sonrası "hasta başına maliyet" Raporlar sayfasında kaynak bazında görünecek.',

	// Finans · AI ile işlem (MONEY-01)
	'finance.ai.title': 'AI ile İşlem',
	'finance.ai.description':
		'WhatsApp grup mesajını yapıştır veya kuyruktan seç — AI işlemleri ayrıştırır, onayladıktan sonra kayıt açılır.',
	'finance.ai.paste.heading': 'Mesajı yapıştır',
	'finance.ai.paste.placeholder':
		'Örnek:\nSandra 2900 GBP 2. vizit ödemesi + 450 GBP t-base ücretleri alındı.\nToplamda 3.350 GBP kart ile ödeme alındı.',
	'finance.ai.paste.longWarning': 'Bu mesaj uzun olabilir. Daha iyi sonuç için bölerek yapıştırın.',
	'finance.ai.paste.tryAnyway': 'Yine de dene',
	'finance.ai.paste.cancel': 'İptal',
	'finance.ai.analyze': 'Analiz Et',
	'finance.ai.analyzing': 'Analiz ediliyor…',
	'finance.ai.fromQueue': "Onay Kuyruğu'ndan seçildi",
	'finance.ai.pending.heading': 'Bekleyenler',
	'finance.ai.pending.process': 'Yeni mesajları işle',
	'finance.ai.pending.processing': 'İşleniyor…',
	'finance.ai.pending.loading': 'Yükleniyor…',
	'finance.ai.pending.empty': 'Bekleyen mesaj yok.',
	'finance.ai.pending.media': 'Medya',
	'finance.ai.pending.mediaDemo': 'Dosya eki (demo)',
	'finance.ai.pending.ignore': 'Yoksay',
	'finance.ai.pending.emptyBody': '(boş mesaj)',
	'finance.ai.drafts.heading': 'Taslaklar',
	'finance.ai.drafts.approve': 'Onayla ve kaydet',
	'finance.ai.drafts.approving': 'Onaylanıyor…',
	'finance.ai.drafts.needInbox':
		'Atomik onay için kuyruktan bir mesaj seçin. Manuel yapıştırma için önce kuyruğa alın.',
	'finance.ai.drafts.footnote':
		'AI çıktısı taslaktır; kur, ödeme durumu, ödenen tutar ve karşı taraf zorunludur. Backend sezgisel parser kullanıyor (LLM henüz yok).',
	'finance.ai.draft.kind': 'Tür',
	'finance.ai.draft.amount': 'Tutar',
	'finance.ai.draft.currency': 'Para birimi',
	'finance.ai.draft.date': 'Tarih',
	'finance.ai.draft.title': 'Başlık',
	'finance.ai.draft.category': 'Kategori',
	'finance.ai.draft.paymentMethod': 'Ödeme yöntemi',
	'finance.ai.draft.patient': 'Hasta',
	'finance.ai.draft.patientNone': '— Seçiniz —',
	'finance.ai.draft.contact': 'Kişi / firma',
	'finance.ai.draft.description': 'Açıklama (orijinal mesaj)',
	'finance.ai.draft.status': 'Ödeme durumu',
	'finance.ai.draft.statusNone': '— Seçiniz —',
	'finance.ai.draft.paidAmount': 'Ödenen tutar',
	'finance.ai.draft.fxRate': 'Kur (1 birim → baz)',
	'finance.ai.draft.amountBase': 'Baz tutar',
	'finance.ai.draft.saved': 'Kaydedildi',
	'finance.ai.parse.none': 'Mesajdan işlem çıkarılamadı.',
	'finance.ai.parse.media': 'Medya mesajı — metin yok.',
	'finance.ai.parse.failed': 'Analiz başarısız',
	'finance.ai.approve.failed': 'Onay başarısız',

	// Marketing hub — ana sayfa (verimaya.com)
	'hub.hero.eyebrow': 'Sağlık turizmi operasyon ekosistemi',
	'hub.hero.title':
		'Lead WhatsApp’ta, hasta Excel’de, ödeme grupta — ay sonunda kim geldi, kim ödedi bilinmiyor.',
	'hub.hero.subtitle':
		'Önce netleştirin: gelen hastayı mı düzene sokacaksınız, reklamdan gelen lead’i mi randevuya çevireceksiniz?',
	'hub.hero.ctaApp': 'Maya App',
	'hub.hero.ctaCrm': 'Maya CRM',
	'hub.hero.forkHint': 'İki kapı. Sonra Kaynaklar ve Araçlar ile güçlenir.',

	'hub.nav.webApp': 'Maya App',
	'hub.nav.crm': 'Maya CRM',
	'hub.nav.resources': 'Kaynaklar',
	'hub.nav.tools': 'Araçlar',

	'hub.apps.title': 'Uygulamalarımız',
	'hub.apps.desc': 'İki platform, tek ekosistem — hangisi size lazımsa onu kullanın.',
	'hub.apps.app.problem': 'Hasta geldikten sonra randevu, dosya ve ödeme dağılmıyor mu? Bu yüzden;',
	'hub.apps.app.name': 'Operasyonu tek panelde topladık.',
	'hub.apps.app.desc':
		'Maya App hasta yolculuğunu yönetir: Hasta kapıdan girince yolculuk tek panelde: randevu, dosya, finans. Operasyon ekibi aynı ekrandan bakar.',
	'hub.apps.app.subs': 'Hastalar · Kişiler · Randevular · Finans · Raporlar',
	'hub.apps.app.outcome': 'Sonuç: ay sonunda kim geldi, kim ödedi — tek yerden görünür.',
	'hub.apps.app.cta': "Maya App'e git",
	'hub.apps.crm.problem': 'Reklam bütçesi gidiyor, lead WhatsApp’ta kayboluyor mu?',
	'hub.apps.crm.name': 'Lead’i randevuya çevirin',
	'hub.apps.crm.desc':
		'Maya CRM (GoHighLevel) lead yakalama, takip ve otomasyonu satış hattında tutar — ekip kişiden kişiye değişmez.',
	'hub.apps.crm.subs': 'Lead yakalama · Otomasyon · Çok kanallı iletişim · Pipeline · Raporlama',
	'hub.apps.crm.outcome': 'Sonuç: lead kaçmaz; takip ölçülür, randevu artar.',
	'hub.apps.crm.cta': "Maya CRM'i aç",
	'hub.stage.app.eyebrow': 'Maya App',
	'hub.stage.crm.eyebrow': 'Maya CRM',

	'hub.resources.problem': 'Ekip sistemi öğrenebilecek mi? İhtiyacınız olan tüm destek içeriği hazır.',
	'hub.resources.title': 'Yazılımı bırakıp gitmiyoruz',
	'hub.resources.desc':
		'Kaynaklar; tüm ekosistemi kullanmayı öğreten alanınız. Ekip aynı dili konuşur, satış ve operasyon kopmaz.',
	'hub.resources.outcome': 'Sonuç: onboarding + içerik + öğrenme — tek çatıda.',
	'hub.resources.ctaPrimary': 'Özellikleri incele',
	'hub.resources.ctaSecondary': 'Ücretsiz karne al',

	'hub.ctaBand.title': 'Hangisinden başlayalım?',
	'hub.ctaBand.subtitle': 'Operasyon paneli mi, satış hattı mı — seçin; Kaynaklar ve Araçlar ikisini de besler.',
	'hub.ctaBand.cta': "Maya App'e git",
	'hub.ctaBand.ctaCrm': "Maya CRM'i aç",

	'hub.features.title': 'Uygulamada neler var?',
	'hub.features.desc': 'Hasta operasyonlarınızı uçtan uca yönetmek için ihtiyacınız olan her şey.',
	'hub.features.patients.title': 'Hasta yönetimi',
	'hub.features.patients.desc':
		'Tüm hasta kayıtları tek ekranda. Tedavi geçmişi, iletişim logları, belgeler ve çift kayıt uyarısı.',
	'hub.features.appointments.title': 'Akıllı randevu',
	'hub.features.appointments.desc':
		'Takvim görünümü, çakışma kontrolü, hatırlatıcılar ve tür bazlı filtreleme.',
	'hub.features.finance.title': 'Finans takibi',
	'hub.features.finance.desc':
		'WhatsApp mesajından AI ile otomatik işlem çıkarımı, bakiye yönetimi, kur hesaplama.',
	'hub.features.reports.title': 'Raporlar',
	'hub.features.reports.desc':
		'Özelleştirilebilir raporlar, hasta başına maliyet, kaynak bazında harcama analizi.',
	'hub.features.cta': 'Tüm özellikleri incele',

	'hub.tools.problem': 'Reklamı yayınlamadan önce plan, deneme ve kontrol hâlâ Excel’de mi?',
	'hub.tools.title': 'Maya App ve Maya CRM’i besleyen araçlar',
	'hub.tools.desc':
		'Araçlar; Maya App ve Maya CRM’i destekler — planlar, simüle eder, yayın öncesi kontrol eder.',
	'hub.tools.campaign.title': 'Kampanya Asistanı',
	'hub.tools.campaign.desc':
		'Reklam kampanyası adımlarını netleştirir; satış hattına hazırlık Maya CRM’i, sonuç takibi Maya App’i besler.',
	'hub.tools.simulator.title': 'Simülatör',
	'hub.tools.simulator.desc':
		'“Şu bütçeyi şu kanala koysak?” — senaryoyu karşılaştırmadan kör harcama yapmazsınız.',
	'hub.tools.prelaunch.title': 'Yayın Öncesi',
	'hub.tools.prelaunch.desc':
		'Yayına girmeden bütçe, kitle, görsel ve metin kontrolleri — boşa giden tıklama riskini keser.',
	'hub.tools.cta': 'Tüm araçları keşfet',

	'hub.scenarios.title': 'Kullanım senaryoları',
	'hub.scenarios.desc': 'Farklı klinik profillerinde Verimaya ekosistemi nasıl çalışır.',
	'hub.scenarios.hair.title': 'Saç ekimi kliniği',
	'hub.scenarios.hair.desc':
		"Lead WhatsApp'tan gelir → Maya CRM'de pipeline'a düşer → Randevu alınır → İşlem yapılır → Ödeme Maya App'te kaydedilir → Raporlanır.",
	'hub.scenarios.dentist.title': 'Diş sağlığı kliniği',
	'hub.scenarios.dentist.desc':
		"Reklamlardan gelen lead Maya CRM'de karşılanır → Konsültasyon randevusu Maya App'te açılır → Tedavi planı çıkar → Ödeme taksitlendirilir.",
	'hub.scenarios.esthetic.title': 'Estetik kliniği',
	'hub.scenarios.esthetic.desc':
		"Hasta bilgileri Maya App'e kaydedilir → Finans ekibi WhatsApp mesajından AI ile işlemleri ayrıştırır → Onay sonrası kayıt düşülür.",

	'hub.karne.title': 'Yapay zeka karnenizi 5 dakikada alın',
	'hub.karne.desc': 'Kurumunuzun yapay zeka olgunluğunu ölçün, eksiklerinizi görün, yol haritanızı çıkarın.',
	'hub.karne.cta': 'Karnemi al',

	'hub.integrations.title': 'Entegrasyonlar',
	'hub.integrations.desc': 'Verimaya ekosistemini güçlendiren servisler.',

	'hub.footer.tagline': 'Hasta yolculuğunu tek panelde yönetin',
	'hub.footer.links': 'Kapılar',
	'hub.footer.legal': 'Yasal',
	'hub.footer.kvkk': 'KVKK Aydınlatma',
	'hub.footer.resources': 'Kaynaklar',
	'hub.footer.tools': 'Araçlar',
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

	'karne.result.gate.eyebrow': 'Result ready',
	'karne.result.gate.title': 'Get the detailed summary by email',
	'karne.result.gate.description':
		'Your scorecard is ready. Leave your email and we will send you the summary.',
	'karne.result.eyebrow': 'Result',
	'karne.result.zeroSummary': 'You have no evidence for {zeros} of {total} questions.',
	'karne.result.weakHeading': 'Top three critical areas',
	'karne.result.strongHeading': 'Area doing well',
	'karne.result.strongRefs.two': '{first} and {second}',
	'karne.result.strongRefs.many': '{leading}, and {last}',
	'karne.result.strongStatus': 'Your status is good for {refs}:',
	'karne.result.euNoticePrefix':
		'Because you have patients living in the UK/EU, AI transparency obligations apply to you from',
	'karne.result.euEffectiveDate': '2 August 2026',
	'karne.result.euNoticeSuffix': '.',
	'karne.result.productBlurb':
		'Verimaya brings the patient journey into one panel — from lead to appointment, finance to WhatsApp transfer.',
	'karne.result.backToShowcase': 'Back to the website',
	'karne.result.demoLogin': 'Sign in for demo',

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

	'settings.organization.timezone': 'Timezone',
	'settings.organization.timezoneHint':
		'Calendar days and appointment filters are computed in this timezone.',
	'settings.organization.tzEuropeIstanbul': 'Europe/Istanbul (Turkey)',
	'settings.organization.tzAsiaRiyadh': 'Asia/Riyadh (Saudi Arabia)',
	'settings.organization.tzEuropeLondon': 'Europe/London (UK)',
	'settings.organization.tzUtc': 'UTC',

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
		'This is the primary signal. On the second measurement, "how many zeros closed" will appear here.',
	'scorecard.percentage.label': 'Percentage',
	'scorecard.percentage.warning':
		'Percentages across headcount bands are not comparable. This percentage is only for comparing with your own prior measurement.',
	'scorecard.maturity.baslangic': 'Starting',
	'scorecard.maturity.parcali': 'Partial',
	'scorecard.maturity.tutarli': 'Consistent',
	'scorecard.maturity.olgun': 'Mature',
	'scorecard.maturity.temporary': 'Maturity thresholds are temporary until field testing.',
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
	'scorecard.scoreOption': 'Score {score}',
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
	'settings.ghl.description': 'Lead and contact sync — webhook-first, field ownership rules.',
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
	'settings.ads.syncHint':
		'Automatic scheduler is off. This button pulls ~10 years of daily spend; Reports only sums rows already in the DB.',
	'settings.ads.googleCustomerId.label': 'Google Ads customer ID',
	'settings.ads.googleCustomerId.hint':
		'If you connected via an MCC, enter the client account number to pull metrics for (dashes optional).',
	'settings.ads.googleCustomerId.save': 'Save customer ID',
	'settings.ads.googleCustomerId.saving': 'Saving…',
	'settings.ads.googleCustomerId.saved': 'Customer ID saved.',
	'settings.ads.googleCustomerId.error': 'Could not save customer ID.',
	'settings.ads.dev.heading': 'Development / demo data',
	'settings.ads.dev.body':
		'Without OAuth, sync writes sample rows. Periodic 6h queue needs ENABLE_INTEGRATION_SCHEDULERS=true — we keep it off in prod.',
	'settings.ads.footnote': 'After connecting, cost-per-patient appears on Reports by source.',

	'finance.ai.title': 'AI Transaction',
	'finance.ai.description':
		'Paste a WhatsApp group message or pick from the queue — AI extracts drafts; records are created only after you approve.',
	'finance.ai.paste.heading': 'Paste message',
	'finance.ai.paste.placeholder':
		'Example:\nSandra 2900 GBP 2nd visit payment + 450 GBP t-base fees received.\nTotal 3,350 GBP paid by card.',
	'finance.ai.paste.longWarning':
		'This message may be long. For better results, paste it in parts.',
	'finance.ai.paste.tryAnyway': 'Try anyway',
	'finance.ai.paste.cancel': 'Cancel',
	'finance.ai.analyze': 'Analyze',
	'finance.ai.analyzing': 'Analyzing…',
	'finance.ai.fromQueue': 'Selected from approval queue',
	'finance.ai.pending.heading': 'Pending',
	'finance.ai.pending.process': 'Process new messages',
	'finance.ai.pending.processing': 'Processing…',
	'finance.ai.pending.loading': 'Loading…',
	'finance.ai.pending.empty': 'No pending messages.',
	'finance.ai.pending.media': 'Media',
	'finance.ai.pending.mediaDemo': 'File attachment (demo)',
	'finance.ai.pending.ignore': 'Ignore',
	'finance.ai.pending.emptyBody': '(empty message)',
	'finance.ai.drafts.heading': 'Drafts',
	'finance.ai.drafts.approve': 'Approve and save',
	'finance.ai.drafts.approving': 'Approving…',
	'finance.ai.drafts.needInbox':
		'Pick a queue message for atomic approval. Manual paste must go through the queue first.',
	'finance.ai.drafts.footnote':
		'AI output is a draft; FX rate, payment status, paid amount and counterparty are required. Backend uses a heuristic parser (LLM not wired yet).',
	'finance.ai.draft.kind': 'Type',
	'finance.ai.draft.amount': 'Amount',
	'finance.ai.draft.currency': 'Currency',
	'finance.ai.draft.date': 'Date',
	'finance.ai.draft.title': 'Title',
	'finance.ai.draft.category': 'Category',
	'finance.ai.draft.paymentMethod': 'Payment method',
	'finance.ai.draft.patient': 'Patient',
	'finance.ai.draft.patientNone': '— Select —',
	'finance.ai.draft.contact': 'Contact / company',
	'finance.ai.draft.description': 'Description (original message)',
	'finance.ai.draft.status': 'Payment status',
	'finance.ai.draft.statusNone': '— Select —',
	'finance.ai.draft.paidAmount': 'Paid amount',
	'finance.ai.draft.fxRate': 'FX rate (1 unit → base)',
	'finance.ai.draft.amountBase': 'Base amount',
	'finance.ai.draft.saved': 'Saved',
	'finance.ai.parse.none': 'Could not extract transactions from message.',
	'finance.ai.parse.media': 'Media message — no text.',
	'finance.ai.parse.failed': 'Analysis failed',
	'finance.ai.approve.failed': 'Approval failed',

	// Marketing hub — homepage (verimaya.com)
	'hub.hero.eyebrow': 'Health tourism operations ecosystem',
	'hub.hero.title':
		'Leads in WhatsApp, patients in Excel, payments in the group chat — month-end, who came and who paid is unclear.',
	'hub.hero.subtitle':
		'First decide: will you tidy the patient journey, or convert ad leads into appointments?',
	'hub.hero.ctaApp': 'Maya App',
	'hub.hero.ctaCrm': 'Maya CRM',
	'hub.hero.forkHint': 'Two doors. Then Resources and Tools amplify both.',

	'hub.nav.webApp': 'Maya App',
	'hub.nav.crm': 'Maya CRM',
	'hub.nav.resources': 'Resources',
	'hub.nav.tools': 'Tools',

	'hub.apps.title': 'Our Applications',
	'hub.apps.desc': 'Two platforms, one ecosystem — use whichever you need.',
	'hub.apps.app.problem': 'After the patient arrives, do appointments, files, and payments scatter? That’s why;',
	'hub.apps.app.name': 'We put operations in one panel.',
	'hub.apps.app.desc':
		'Maya App manages the patient journey: once they walk in, appointments, files, and finance stay on one panel. The ops team works from the same screen.',
	'hub.apps.app.subs': 'Patients · Contacts · Appointments · Finance · Reports',
	'hub.apps.app.outcome': 'Outcome: who came, who paid — visible in one place at month end.',
	'hub.apps.app.cta': 'Go to Maya App',
	'hub.apps.crm.problem': 'Ad spend running while leads vanish in WhatsApp?',
	'hub.apps.crm.name': 'Turn leads into appointments',
	'hub.apps.crm.desc':
		'Maya CRM (GoHighLevel) keeps capture, follow-up, and automation on the sales line — process doesn’t depend on who is online.',
	'hub.apps.crm.subs': 'Lead capture · Automation · Multi-channel · Pipeline · Reports',
	'hub.apps.crm.outcome': 'Outcome: leads don’t slip; follow-up is measurable; appointments rise.',
	'hub.apps.crm.cta': 'Open Maya CRM',
	'hub.stage.app.eyebrow': 'Maya App',
	'hub.stage.crm.eyebrow': 'Maya CRM',

	'hub.resources.problem': 'Can the team learn the system? All the support content you need is ready.',
	'hub.resources.title': 'We don’t hand you software and leave',
	'hub.resources.desc':
		'Resources teaches your team the whole ecosystem. Everyone shares one language — sales and ops stay connected.',
	'hub.resources.outcome': 'Outcome: onboarding + content + learning under one roof.',
	'hub.resources.ctaPrimary': 'Browse features',
	'hub.resources.ctaSecondary': 'Get a free scorecard',

	'hub.ctaBand.title': 'Where do we start?',
	'hub.ctaBand.subtitle': 'Operations panel or sales line — pick one; Resources and Tools feed both.',
	'hub.ctaBand.cta': 'Go to Maya App',
	'hub.ctaBand.ctaCrm': 'Open Maya CRM',

	'hub.features.title': "What's in the application?",
	'hub.features.desc': 'Everything you need to manage patient operations end to end.',
	'hub.features.patients.title': 'Patient management',
	'hub.features.patients.desc':
		'All patient records in one screen. Treatment history, communication logs, documents, and duplicate alerts.',
	'hub.features.appointments.title': 'Smart appointments',
	'hub.features.appointments.desc':
		'Calendar view, conflict detection, reminders, and type-based filtering.',
	'hub.features.finance.title': 'Finance tracking',
	'hub.features.finance.desc':
		'AI-powered transaction extraction from WhatsApp, balance management, FX rate calculation.',
	'hub.features.reports.title': 'Reports',
	'hub.features.reports.desc':
		'Customizable reports, cost per patient, source-based spend analysis.',
	'hub.features.cta': 'View all features',

	'hub.tools.problem': 'Before you launch ads, is planning, testing, and checking still stuck in Excel?',
	'hub.tools.title': 'Tools that feed Maya App and Maya CRM',
	'hub.tools.desc':
		'Tools support Maya App and Maya CRM — plan, simulate, and check before go-live.',
	'hub.tools.campaign.title': 'Campaign Assistant',
	'hub.tools.campaign.desc':
		'Clarifies campaign steps; sales prep feeds Maya CRM, results tracking feeds Maya App.',
	'hub.tools.simulator.title': 'Simulator',
	'hub.tools.simulator.desc':
		'“What if that budget went to that channel?” — compare before you spend blind.',
	'hub.tools.prelaunch.title': 'Pre-launch',
	'hub.tools.prelaunch.desc':
		'Budget, audience, creative, and copy checks before launch — cut wasted clicks.',
	'hub.tools.cta': 'Discover all tools',

	'hub.scenarios.title': 'Use cases',
	'hub.scenarios.desc': 'How the Verimaya ecosystem works across different clinic profiles.',
	'hub.scenarios.hair.title': 'Hair transplant clinic',
	'hub.scenarios.hair.desc':
		"Lead arrives via WhatsApp → drops into Maya CRM pipeline → Appointment booked → Procedure done → Payment logged in Maya App → Reported.",
	'hub.scenarios.dentist.title': 'Dental clinic',
	'hub.scenarios.dentist.desc':
		"Lead from ads lands in Maya CRM → Consultation appointment opened in Maya App → Treatment plan created → Payment split into installments.",
	'hub.scenarios.esthetic.title': 'Aesthetics clinic',
	'hub.scenarios.esthetic.desc':
		"Patient info saved to Maya App → Finance team uses WhatsApp AI to extract transactions → Records created after approval.",

	'hub.karne.title': 'Get your AI scorecard in 5 minutes',
	'hub.karne.desc': 'Measure your AI maturity, see gaps, and chart your roadmap.',
	'hub.karne.cta': 'Get my scorecard',

	'hub.integrations.title': 'Integrations',
	'hub.integrations.desc': 'Services powering the Verimaya ecosystem.',

	'hub.footer.tagline': 'Manage the patient journey in one panel',
	'hub.footer.links': 'Doors',
	'hub.footer.legal': 'Legal',
	'hub.footer.kvkk': 'KVKK Disclosure',
	'hub.footer.resources': 'Resources',
	'hub.footer.tools': 'Tools',
} as const;

export const messages = { tr, en } as const;
