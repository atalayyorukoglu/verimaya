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
/**
 * Bir özelliğin changelog'a **ilk girdiği** tarih. Yoksa `null`.
 *
 * `features.ts` ile `changelog.ts` zaten ayrı ayrı tutuluyor; bu fonksiyon ikisini
 * birleştirir ve "Yeni" rozetini **bedavaya** üretir — yeni veri yazmaya gerek yok.
 * DOC-04 kuralı (her özellik aynı commit'te changelog'a yazılır) bunu otomatik besler.
 */
export function featureFirstReleaseDate(featureId: string): string | null {
	let earliest: string | null = null;
	for (const entry of changelog) {
		for (const change of entry.changes) {
			if (change.featureId !== featureId) continue;
			if (earliest === null || entry.date < earliest) earliest = entry.date;
		}
	}
	return earliest;
}

/**
 * Kaç gün "Yeni" sayılır.
 *
 * 30 gündü, **14'e indirildi (2026-08-24)**: bu projede neredeyse her gün sürüm çıkıyor,
 * 30 günlük pencerede bir aylık iş birden "yeni" görünüyordu (GoHighLevel senkronu gibi
 * çoktan yerleşmiş özellikler dahil). Rozet her yerdeyse hiçbir yerde değildir.
 */
export const FEATURE_NEW_WINDOW_DAYS = 14;

/**
 * `today`'e göre özellik yeni mi. `today` dışarıdan verilir ki test sabit kalsın ve
 * saat dilimi kararı çağıranda olsun.
 */
export function isFeatureNew(featureId: string, today: string): boolean {
	const released = featureFirstReleaseDate(featureId);
	if (!released) return false;
	const diffMs = Date.parse(today) - Date.parse(released);
	if (Number.isNaN(diffMs) || diffMs < 0) return false;
	return diffMs <= FEATURE_NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export const changelog: ChangelogEntry[] = [
	{
		version: '0.11.0',
		date: '2026-08-23',
		title: 'AI temeli ve operasyon derinliği',
		changes: [
			{
				type: 'eklendi',
				module: 'WhatsApp',
				text: 'WhatsApp taslağındaki her alan artık hangi cümleden çıktığını taşıyor; kartta kaynak rozetine tıklayınca mesajda o alıntı vurgulanıyor ve onaylanan işlem kaydı kaynak bağını koruyor. Model uydurma bir alıntı verirse sunucu onu düşürüyor.',
				featureId: 'ai-evidence'
			},
			{
				type: 'eklendi',
				module: 'Randevu',
				text: 'WhatsApp mesajı geldiğinde finans taslağıyla birlikte randevu güncelleme önerisi de üretiliyor; ikisi de ayrı ayrı onay bekliyor. Randevu tarafındaki bir hata finans taslağını düşürmüyor.',
				featureId: 'ai-record-suggestions'
			},
			{
				type: 'eklendi',
				module: 'Platform',
				text: 'Maya artık bilgi bankasının yanı sıra canlı veriye de bakabiliyor: bakiye, açık alacaklar, randevu, dönem özeti ve temassız kişiler. Rakamı veritabanı veriyor, model yalnız hangi sorgunun çalışacağını seçiyor; izin her araç için ayrı kontrol ediliyor.',
				featureId: 'maya-live-data'
			},
			{
				type: 'eklendi',
				module: 'Hasta Takibi',
				text: 'Kişilere ünvan (hekim, koordinatör, satış, reklam uzmanı…) atanabiliyor; ünvan listesi Ayarlar’dan yönetiliyor. Ünvan yalnız tanımlayıcı bilgidir — yetkiyi değiştirmez.',
				featureId: 'contact-titles'
			},
			{
				type: 'eklendi',
				module: 'Randevu',
				text: 'Randevuya hekim atanabiliyor; randevu metrikleri raporu hekim kırılımı ve hekim × randevu tipi çapraz sayımı döndürüyor (RPT oranı buradan hesaplanıyor).',
				featureId: 'appointment-doctor'
			},
			{
				type: 'eklendi',
				module: 'Hasta Takibi',
				text: 'Hasta dosyasından tek tıkla olay kaydı açılabiliyor (revizyon gerekti, komplikasyon, süreç gecikmesi…); dosya, tarih ve randevu önceden dolu gelir, maliyeti opsiyonel olarak yazılır ve olay çözüldü olarak kapatılır.',
				featureId: 'incidents'
			},
			{
				type: 'eklendi',
				module: 'Raporlama',
				text: 'Referans değeri raporu: kim kaç kişi getirdi, o kişilerden ne kazanıldı, referans verenin ünvanı ve koordinatörü kim. Rakamlar kişi kartındaki finans özetiyle aynı kaynaktan gelir.',
				featureId: 'referral-value'
			},
			{
				type: 'eklendi',
				module: 'Raporlama',
				text: 'Özet ve randevu metrikleri raporları önceki dönemle karşılaştırılabiliyor. Önceki dönem, aynı gün sayısında ve hemen öncesinde biten penceredir; az kayda dayanan değişimde yüzde gösterilmez.',
				featureId: 'report-compare'
			},
			{
				type: 'eklendi',
				module: 'Raporlama',
				text: 'AI isabet ölçümü: taslakların ne kadarı dokunulmadan onaylanıyor, hangi alan en çok düzeltiliyor, Maya hangi soruları cevaplayamıyor. Cevaplanamayan sorular “bilgi bankasına ekle” yönlendirmesiyle gösteriliyor.',
				featureId: 'ai-accuracy'
			},
			{
				type: 'eklendi',
				module: 'Raporlama',
				text: 'Müdahale listesi: hekim bazında kötüleşen RPT/gelmeme/iptal oranı, düşen dönem geliri/neti, çözülmemiş olaylar ve en değerli referanslar tek yerde, kimse sormadan işaretleniyor. Cümleler sabit şablon, rakamlar veritabanından — hiçbir bulgu dil modeliyle üretilmiyor; gürültüyü elemek için sabit eşik tablosu kullanılıyor.',
				featureId: 'interventions'
			},
			{
				type: 'guvenlik',
				module: 'Finans',
				text: 'İşlem oluşturma ve güncelleme artık denetim kaydına yazılıyor (önceden yalnız silme yazılıyordu); WhatsApp onay yolu dahil.'
			},
			{
				type: 'guvenlik',
				module: 'Platform',
				text: 'Yeni veritabanı tablolarına otomatik güncelleme yetkisi verilmesi durduruldu — denetim amaçlı tablolar artık yanlışlıkla güncellenebilir kalmıyor.'
			}
		]
	},
	{
		version: '0.10.0',
		date: '2026-08-17',
		title: 'AI katmanı temeli',
		changes: [
			{
				type: 'eklendi',
				module: 'WhatsApp',
				text: 'Firma bilgi bankası: hizmetler, fiyatlar, ödeme kuralları, sık sorulanlar ve red gerekçeleri Ayarlar’dan giriliyor; WhatsApp ayrıştırması ve Maya bu bilgiden besleniyor. Değişiklikler sürümlenerek saklanıyor.',
				featureId: 'ai-knowledge-base'
			},
			{
				type: 'eklendi',
				module: 'Randevu',
				text: 'Zaman kilitli operasyon alarmları: uçuş ve transfer gibi kalemler için eşiğe gelindiğinde uyarı üretiliyor. Deterministik kod — yapay zekâ değil.',
				featureId: 'ai-operation-alerts'
			}
		]
	},
	{
		version: '0.9.0',
		date: '2026-08-14',
		title: 'Tehlikeli bölge: operasyonel veri silme',
		changes: [
			{
				type: 'eklendi',
				module: 'Ayarlar',
				text: 'Sahip, Ayarlar → Tehlikeli bölgede seçtiği işlem/randevu/kişi/dosya verisini önce önizleyip organizasyon adını yazarak kalıcı silebilir; denetim kaydı ve org ayarları korunur.'
			}
		]
	},
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
