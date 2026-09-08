import Foundation

/*
 Arayüz metinleri.

 Hepsi web kataloğundan BİREBİR alındı — kendi metnimizi uydurmuyoruz:
   • `apps/web/src/lib/i18n/messages.ts` (tr bloğu)
   • `packages/shared/src/labels.ts` (durum/tür etiketleri)

 Anahtar adları web'deki nokta ayrımını izler (`finance.filter.kindAll` →
 `S.Finance.Filter.kindAll`), böylece hangi metnin nereden geldiği okunur kalır.
*/
enum S {
    enum Nav {
        static let contacts = "Kişiler"
        static let appointments = "Randevular"
        static let transactions = "Finans"
        static let reports = "Raporlar"
        static let groupProducts = "Ürünler"
    }

    enum Shell {
        static let menu = "Menü"
        static let ariaMenu = "Menü"
        static let ariaCloseMenu = "Menüyü kapat"
        static let ariaBottomNav = "Alt menü"
        static let ariaAllMenu = "Tüm menü"
        static let ariaAccountMenu = "Hesap menüsü"
        static let ariaHome = "Verimaya"
        static let supportTitle = "Destek"
        static let supportDescription = "Sorun bildirimi ve yardım"
        static let supportBody = "Sorun veya geri bildirim için destek ekibine yazın."
        static let supportClose = "Kapat"
        static let supportEmail = "destek@verimaya.com"
        static let signOut = "Çıkış yap"
        static let orgSwitch = "Organizasyon değiştir"
    }

    enum Theme {
        static let light = "Açık tema"
        static let dark = "Koyu tema"
    }

    enum Common {
        static let loading = "Yükleniyor…"
        static let cancel = "İptal"
        static let close = "Kapat"
        static let edit = "Düzenle"
        static let apply = "Uygula"
        static let wait = "Bekleyin…"
        static let save = "Kaydet"
        static let delete = "Sil"
        static let retry = "Yeniden dene"
        static let saveFailed = "Kayıt başarısız"
    }

    enum Command {
        static let aria = "Hızlı arama"
        static let placeholder = "Hasta, randevu veya işlem ara…"
        static let minChars = "En az 2 karakter yazın"
        static let empty = "Sonuç yok"
        static let groupTransactions = "İşlemler"
    }

    enum Contacts {
        static let documentTitle = "Kişiler · Verimaya"
        static let title = "Kişiler"
        static let description = "Otel, klinik, transfer, hasta ve diğer cariler — hasta iş kaydından ayrı dizin."
        /// `{count} kişi`
        static let total = "{count} kişi"
        static let totalFiltered = "{count} kişi (filtreli)"
        static let new = "Yeni kişi"
        static let duplicates = "Çift kayıt tara"
        static let loading = "Yükleniyor…"
        static let emptyTitle = "Kişi bulunamadı"
        static let emptyCta = "Yeni kişi ekle"
        static let filterTypeAll = "Tüm türler"
        static let filterTypeAria = "Tür filtresi"
        static let colPhone = "Telefon"
        static let colEmail = "E-posta"
        static let loadMore = "Daha fazla yükle"
    }

    enum Appointments {
        static let documentTitle = "Randevular · Verimaya"
        static let title = "Randevular"
        static let new = "Yeni randevu"
        static let loading = "Yükleniyor…"
        static let emptyTitle = "Bu dönemde randevu yok"
        static let emptyBody = "Dönemi değiştirin veya yeni randevu ekleyin."
        static let loadMore = "Daha fazla yükle"
        /// `{period} · {count} randevu`
        static let periodSummary = "{period} · {count} randevu"
        static let filterTypeAll = "Tüm türler"
        static let filterTypeAria = "Tür filtresi"
        static let filterStatusAll = "Tüm durumlar"
        static let filterStatusAria = "Durum filtresi"
        static let cardClinic = "Klinik"
        static let cardHotel = "Otel"
        static let cardTransfer = "Transfer"
    }

    enum Finance {
        static let title = "İşlemler"
        static let description = "Gelir ve gider kayıtları (tutarlar minor unit)."
        static let total = "{count} işlem"
        static let totalFiltered = "{count} işlem (filtreli)"
        static let aiLink = "AI ile işlem"
        static let commissionsLink = "Hakediş"
        static let new = "Yeni işlem"
        static let loading = "Yükleniyor…"
        static let empty = "İşlem yok."
        static let emptyFiltered = "Filtrelere uyan işlem yok."
        static let loadMore = "Daha fazla yükle"

        enum Filter {
            static let qPlaceholder = "Başlık, kategori, hasta, kişi…"
            static let kindAll = "Tüm türler"
            static let statusAll = "Tüm durumlar"
            static let clear = "Temizle"
        }

        enum Balances {
            static let title = "Bakiyeler"
            static let fullPage = "Detay"
            static let summaryPayable = "Borç"
            static let summaryReceivable = "Alacak"
            static let empty = "Açık bakiye yok."
            static let filterAll = "Tümü"
            static let filterPayable = "Borçlarımız"
            static let filterReceivable = "Alacaklarımız"
            static let emptyFiltered = "Bu filtrede kayıt yok."
            static let debtor = "Borçlu"
            static let creditor = " → alacaklı "
            static let selfLabel = "Biz"
        }

        enum AI {
            static let title = "AI ile İşlem"
            static let description = "WhatsApp grup mesajını yapıştır veya kuyruktan seç — AI işlemleri ayrıştırır, onayladıktan sonra kayıt açılır."
            static let pasteHeading = "Mesajı yapıştır"
            static let pastePlaceholder = "Örnek:\nSandra 2900 GBP 2. vizit ödemesi + 450 GBP t-base ücretleri alındı.\nToplamda 3.350 GBP kart ile ödeme alındı."
            static let analyze = "Analiz Et"
            static let analyzing = "Analiz ediliyor…"
            static let fromQueue = "Onay Kuyruğu'ndan seçildi"
            static let pendingHeading = "Bekleyenler"
            static let pendingProcess = "Yeni mesajları işle"
            static let pendingProcessing = "İşleniyor…"
            static let pendingEmpty = "Bekleyen mesaj yok."
            static let pendingMedia = "Medya"
            static let pendingIgnore = "Yoksay"
            static let pendingEmptyBody = "(boş mesaj)"
            static let draftsHeading = "Taslaklar"
            static let draftsApprove = "Onayla ve kaydet"
            static let draftsFootnote = "AI çıktısı taslaktır; kur, ödeme durumu, ödenen tutar ve karşı taraf zorunludur. Backend sezgisel parser kullanıyor (LLM henüz yok)."
            static let parseNone = "Mesajdan işlem çıkarılamadı."
        }
    }

    enum Reports {
        static let title = "Raporlar"
        static let tabSummary = "Özet"
        /// Web'de bu iki sekme etiketi kataloğa taşınmamış, doğrudan gömülü.
        static let tabCategory = "Kategori"
        static let tabMarketing = "Pazarlama"
        static let loading = "Yükleniyor…"
        static let monthlyIoE = "Aylık gelir / gider"
        static let kindAll = "Tümü"
        static let txLabel = "İşlem"
        static let emptyPeriod = "Bu dönemde işlem yok. Dönemi genişletmeyi dene."
        static let txCount = "{count} işlem"
        static let categoryReport = "Kategori raporu"
        static let categoriesBack = "Kategoriler"
        static let compareLabel = "Önceki döneme göre"

        /// Web'de gömülü: "Toplam gelir ({currency})" vb.
        static let totalIncome = "Toplam gelir"
        static let totalExpense = "Toplam gider"
        static let net = "Net"
        static let pending = "Bekleyen tahsilat"
        static let income = "Gelir"
        static let expense = "Gider"

        enum Period {
            static let label = "Dönem"
            static let thisMonth = "Bu ay"
            static let lastMonth = "Geçen ay"
            static let allTime = "Tüm zamanlar"
            static let custom = "Özel"
            static let from = "Başlangıç"
            static let to = "Bitiş"
            static let goThisMonth = "Bu aya git"
            static let prevMonth = "Önceki ay"
            static let nextMonth = "Sonraki ay"
        }

        enum Ops {
            static let title = "Operasyon"
            static let description = "Randevu tamamlanma, no-show ve klinik performansı."
            static let empty = "Bu dönemde randevu yok."
            static let total = "Toplam randevu"
            static let completion = "Tamamlanma"
            static let noShow = "No-show"
            static let cancellation = "İptal"
            static let clinics = "Klinik kırılımı"
            static let types = "Randevu tipi"
            static let monthly = "Aylık randevu trendi"
            /// `{count} · tamamlanma {pct}`
            static let clinicStats = "{count} · tamamlanma {pct}"
        }

        enum StatusDist {
            static let title = "Dosya durumu"
            static let empty = "Dosya kaydı yok."
        }

        enum Consistency {
            static let title = "Tutarlılık uyarıları"
            static let description = "Kategori / hasta / kişi seçimleri veya ödeme durumu tutarsız görünen işlemler."
            static let clean = "Tüm kayıtlar temiz görünüyor."
            static let badge = "{count} uyarı"

            /// Sunucu `message_key` döner (`reports.consistency.<code>`); metin
            /// katalogdan çözülür — sunucudan gelen metin ekrana basılmaz.
            static let messages: [String: String] = [
                "category_missing": "Kategori boş.",
                "income_contact_missing": "Gelir kaydında kişi seçilmemiş.",
                "expense_contact_missing": "Gider kaydında kişi/firma yok.",
                "fx_missing": "Kur karşılığı yok (rapora dahil edilmedi).",
                "paid_amount_mismatch": "Durum “ödendi” ama ödenen tutar kayıt tutarından farklı.",
                "unpaid_with_payment": "Durum “ödenmedi” ama ödenen tutar sıfırdan büyük.",
                "partial_amount_invalid": "Durum “kısmi” ama ödenen tutar boş, ≤0 veya tutara eşit/büyük.",
                "contact_equals_responsible": "Kişi ve sorumlu aynı olamaz.",
                "responsible_not_internal": "Sorumlu, şirket içi personel olmalı."
            ]
        }

        enum Marketing {
            static let spend = "Reklam harcaması"
            static let noData = "Bu dönem için pazarlama verisi yok."
            static let noDataHint = "Reklam hesabı bağlandığında harcama ve ROAS burada görünür."
        }
    }

    enum Account {
        static let title = "Profil ayarları"
        static let nav = "Profil ayarları"
        static let description = "Hesap bilgilerin, şifre ve görünüm tercihlerin."
        static let profileHeading = "Profil"
        static let profileHint = "Ad ve e-posta şimdilik salt okunur; düzenleme yakında."
        static let displayName = "Görünen ad"
        static let email = "E-posta"
        static let themeHeading = "Tema"
        static let themeHint = "Açık veya koyu görünüm — tercih bu cihazda saklanır."
        static let notificationsHeading = "Bildirim tercihleri"
        static let notificationsSoon = "E-posta ve ürün içi bildirim seçenekleri yakında."

        enum Password {
            static let title = "Şifreni değiştir"
            static let description = "Mevcut şifreni ve yeni şifreni gir. Diğer oturumlar kapanır."
            static let current = "Mevcut şifre"
            static let new = "Yeni şifre"
            static let confirm = "Yeni şifre (tekrar)"
            static let submit = "Şifreyi değiştir"
            static let mismatch = "Şifreler eşleşmiyor"
            static let tooShort = "Şifre en az 8 karakter olmalı"
        }
    }

    /// `packages/shared/src/labels.ts` — sunucu sözlüğüyle aynı.
    enum Labels {
        static let contactStatus: [String: String] = [
            "scheduled": "Randevu alındı",
            "arrived": "Geldi",
            "treated": "Tedavi edildi",
            "follow_up": "Takip",
            "cancelled": "İptal"
        ]
        static let appointmentStatus: [String: String] = [
            "scheduled": "Planlandı",
            "confirmed": "Onaylandı",
            "in_progress": "Devam ediyor",
            "completed": "Tamamlandı",
            "cancelled": "İptal",
            "no_show": "Gelmedi"
        ]
        static let transactionKind: [String: String] = [
            "income": "Gelir",
            "expense": "Gider"
        ]
        static let transactionStatus: [String: String] = [
            "paid": "Ödendi",
            "partial": "Kısmi",
            "unpaid": "Ödenmedi"
        ]
        static let inboundMessageStatus: [String: String] = [
            "new": "Yeni",
            "parsed": "Ayrıştırıldı",
            "approved": "Onaylandı",
            "ignored": "Yoksayıldı"
        ]
    }
}
