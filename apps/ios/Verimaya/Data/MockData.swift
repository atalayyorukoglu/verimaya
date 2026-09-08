import Foundation

/*
 Örnek veri — SwiftUI önizlemeleri ve testler için.

 Ekranlar artık bu dosyadan BESLENMİYOR: gerçek veri `/v1/…` uçlarından,
 `Stores/` altındaki depolar üzerinden gelir. Burası silinmedi çünkü önizleme
 ve birim testleri ağa çıkmadan gerçekçi kayıtlarla çalışabilsin.

 Tarihler "bugüne göre" üretilir.
*/
enum MockData {

    // MARK: Takvim yardımcıları

    static var calendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.locale = VMFormat.locale
        cal.timeZone = VMFormat.timeZone
        return cal
    }()

    /// Bu ayın ilk günü (yerel saat).
    static var monthStart: Date {
        let comps = calendar.dateComponents([.year, .month], from: Date())
        return calendar.date(from: comps) ?? Date()
    }

    /// `monthOffset` ay kaydırarak, ayın `day`. günü, `hour`:`minute`.
    static func date(monthOffset: Int = 0, day: Int, hour: Int = 9, minute: Int = 0) -> Date {
        let base = calendar.date(byAdding: .month, value: monthOffset, to: monthStart) ?? monthStart
        var comps = calendar.dateComponents([.year, .month], from: base)
        comps.day = day
        comps.hour = hour
        comps.minute = minute
        return calendar.date(from: comps) ?? base
    }

    // MARK: Kiracı / kullanıcı

    static let tenantName = "OrbisMed"
    static let userDisplayName = "Atalay Yörükoğlu"
    static let userEmail = "atalay@orbismed.com"
    static let baseCurrency = "TRY"

    // MARK: Kişi türleri

    static let contactTypes: [ContactType] = [
        ContactType(id: "ct-hasta", name: "Hasta"),
        ContactType(id: "ct-klinik", name: "Klinik"),
        ContactType(id: "ct-otel", name: "Otel"),
        ContactType(id: "ct-transfer", name: "Transfer"),
        ContactType(id: "ct-tedarikci", name: "Tedarikçi")
    ]

    static func typeName(_ id: String) -> String {
        contactTypes.first { $0.id == id }?.name ?? "—"
    }

    // MARK: Kişiler

    static let contacts: [Contact] = [
        Contact(id: "c-01", displayName: "Sandra Whitfield",
                firstName: "Sandra", lastName: "Whitfield", typeId: "ct-hasta",
                phone: "+44 7700 900112", email: "sandra.w@example.co.uk", status: .treated),
        Contact(id: "c-02", displayName: "Ahmet Yıldırım",
                firstName: "Ahmet", lastName: "Yıldırım", typeId: "ct-hasta",
                phone: "+90 532 415 88 20", email: "ahmet.yildirim@example.com", status: .scheduled),
        Contact(id: "c-03", displayName: "Marek Kowalski",
                firstName: "Marek", lastName: "Kowalski", typeId: "ct-hasta",
                phone: "+48 601 224 118", email: nil, status: .arrived),
        Contact(id: "c-04", displayName: "Fatima Al Rashid",
                firstName: "Fatima", lastName: "Al Rashid", typeId: "ct-hasta",
                phone: "+971 50 774 2210", email: "f.alrashid@example.ae", status: .follow_up),
        Contact(id: "c-05", displayName: "Dmitri Sokolov",
                firstName: "Dmitri", lastName: "Sokolov", typeId: "ct-hasta",
                phone: "+7 916 220 4471", email: "d.sokolov@example.ru", status: .cancelled),
        Contact(id: "c-06", displayName: "Elena Petrova",
                firstName: "Elena", lastName: "Petrova", typeId: "ct-hasta",
                phone: "+7 903 118 6640", email: "elena.p@example.ru", status: .scheduled),
        Contact(id: "c-07", displayName: "Estetik International Klinik",
                firstName: "Estetik", lastName: "International Klinik", typeId: "ct-klinik",
                phone: "+90 212 344 10 90", email: "operasyon@estetikintl.com", status: nil),
        Contact(id: "c-08", displayName: "Nişantaşı Dental Center",
                firstName: "Nişantaşı", lastName: "Dental Center", typeId: "ct-klinik",
                phone: "+90 212 231 44 05", email: "info@nsdental.com", status: nil),
        Contact(id: "c-09", displayName: "Grand Levent Hotel",
                firstName: "Grand", lastName: "Levent Hotel", typeId: "ct-otel",
                phone: "+90 212 270 33 00", email: "rezervasyon@grandlevent.com", status: nil),
        Contact(id: "c-10", displayName: "Taksim Suites",
                firstName: "Taksim", lastName: "Suites", typeId: "ct-otel",
                phone: "+90 212 292 71 40", email: "front@taksimsuites.com", status: nil),
        Contact(id: "c-11", displayName: "Mavi Transfer",
                firstName: "Mavi", lastName: "Transfer", typeId: "ct-transfer",
                phone: "+90 533 660 22 14", email: "operasyon@mavitransfer.com", status: nil),
        Contact(id: "c-12", displayName: "VIP Yol Transfer",
                firstName: "VIP", lastName: "Yol Transfer", typeId: "ct-transfer",
                phone: "+90 542 118 09 77", email: nil, status: nil),
        Contact(id: "c-13", displayName: "Medikal Sarf Deposu",
                firstName: "Medikal", lastName: "Sarf Deposu", typeId: "ct-tedarikci",
                phone: "+90 216 470 12 33", email: "satis@medikalsarf.com", status: nil),
        Contact(id: "c-14", displayName: "Meta Ads",
                firstName: "Meta", lastName: "Ads", typeId: "ct-tedarikci",
                phone: nil, email: "billing@meta.com", status: nil)
    ]

    // MARK: Randevular

    static let appointments: [Appointment] = [
        Appointment(id: "a-01", contactId: "c-01", contactDisplayName: "Sandra Whitfield",
                    startsAt: date(day: 3, hour: 9, minute: 30),
                    endsAt: date(day: 3, hour: 13, minute: 0),
                    status: .completed, appointmentType: "Yeni Hasta",
                    clinicName: "Estetik International Klinik", hotelName: "Grand Levent Hotel",
                    transferNote: "Mavi Transfer"),
        Appointment(id: "a-02", contactId: "c-02", contactDisplayName: "Ahmet Yıldırım",
                    startsAt: date(day: 7, hour: 11, minute: 0),
                    endsAt: date(day: 7, hour: 12, minute: 0),
                    status: .confirmed, appointmentType: "Devam",
                    clinicName: "Nişantaşı Dental Center", hotelName: nil,
                    transferNote: nil),
        Appointment(id: "a-03", contactId: "c-03", contactDisplayName: "Marek Kowalski",
                    startsAt: date(day: 11, hour: 16, minute: 30),
                    endsAt: nil,
                    status: .scheduled, appointmentType: "RPT",
                    clinicName: "Estetik International Klinik", hotelName: "Taksim Suites",
                    transferNote: "VIP Yol Transfer"),
        Appointment(id: "a-04", contactId: "c-04", contactDisplayName: "Fatima Al Rashid",
                    startsAt: date(day: 14, hour: 10, minute: 0),
                    endsAt: date(day: 14, hour: 11, minute: 30),
                    status: .completed, appointmentType: "Devam",
                    clinicName: "Nişantaşı Dental Center", hotelName: "Grand Levent Hotel",
                    transferNote: "Mavi Transfer"),
        Appointment(id: "a-05", contactId: "c-05", contactDisplayName: "Dmitri Sokolov",
                    startsAt: date(day: 17, hour: 14, minute: 0),
                    endsAt: nil,
                    status: .cancelled, appointmentType: "Yeni Hasta",
                    clinicName: "Estetik International Klinik", hotelName: nil,
                    transferNote: "Uçuş iptal edildi, yeniden planlanacak"),
        Appointment(id: "a-06", contactId: "c-06", contactDisplayName: "Elena Petrova",
                    startsAt: date(day: 21, hour: 9, minute: 0),
                    endsAt: date(day: 21, hour: 15, minute: 0),
                    status: .scheduled, appointmentType: "Yeni Hasta",
                    clinicName: "Estetik International Klinik", hotelName: "Taksim Suites",
                    transferNote: "Mavi Transfer"),
        Appointment(id: "a-07", contactId: "c-01", contactDisplayName: "Sandra Whitfield",
                    startsAt: date(day: 24, hour: 13, minute: 15),
                    endsAt: date(day: 24, hour: 14, minute: 0),
                    status: .no_show, appointmentType: "RPT",
                    clinicName: "Nişantaşı Dental Center", hotelName: nil,
                    transferNote: nil),
        Appointment(id: "a-08", contactId: "c-03", contactDisplayName: "Marek Kowalski",
                    startsAt: date(day: 27, hour: 12, minute: 0),
                    endsAt: date(day: 27, hour: 12, minute: 45),
                    status: .in_progress, appointmentType: "Devam",
                    clinicName: "Estetik International Klinik", hotelName: "Grand Levent Hotel",
                    transferNote: "VIP Yol Transfer"),
        // Geçen ay — dönem seçici gerçekten süzsün diye.
        Appointment(id: "a-09", contactId: "c-04", contactDisplayName: "Fatima Al Rashid",
                    startsAt: date(monthOffset: -1, day: 12, hour: 10, minute: 30),
                    endsAt: date(monthOffset: -1, day: 12, hour: 12, minute: 0),
                    status: .completed, appointmentType: "Yeni Hasta",
                    clinicName: "Nişantaşı Dental Center", hotelName: "Grand Levent Hotel",
                    transferNote: "Mavi Transfer"),
        Appointment(id: "a-10", contactId: "c-02", contactDisplayName: "Ahmet Yıldırım",
                    startsAt: date(monthOffset: -1, day: 19, hour: 15, minute: 0),
                    endsAt: nil,
                    status: .completed, appointmentType: "Devam",
                    clinicName: "Estetik International Klinik", hotelName: nil,
                    transferNote: nil),
        Appointment(id: "a-11", contactId: "c-06", contactDisplayName: "Elena Petrova",
                    startsAt: date(monthOffset: -1, day: 26, hour: 11, minute: 0),
                    endsAt: date(monthOffset: -1, day: 26, hour: 11, minute: 40),
                    status: .no_show, appointmentType: "RPT",
                    clinicName: "Estetik International Klinik", hotelName: "Taksim Suites",
                    transferNote: "VIP Yol Transfer")
    ]

    /// Randevu tipi sözlüğü (web'de tenant ayarlarından gelir).
    static let appointmentTypeNames = ["Yeni Hasta", "Devam", "RPT"]

    // MARK: İşlemler

    static let transactions: [Transaction] = [
        Transaction(id: "t-01", kind: .income, status: .paid, amount: 335_000, currency: "GBP",
                    amountBase: 14_405_000, occurredOn: date(day: 3),
                    title: "2. vizit ödemesi", category: "Tedavi geliri", subtitle: "Saç ekimi",
                    contactDisplayName: "Sandra Whitfield", description: nil),
        Transaction(id: "t-02", kind: .expense, status: .paid, amount: 420_000, currency: "TRY",
                    amountBase: 420_000, occurredOn: date(day: 3),
                    title: nil, category: "Klinik hakediş", subtitle: "Estetik International",
                    contactDisplayName: "Estetik International Klinik", description: nil),
        Transaction(id: "t-03", kind: .expense, status: .paid, amount: 96_000, currency: "TRY",
                    amountBase: 96_000, occurredOn: date(day: 4),
                    title: "Konaklama 3 gece", category: "Otel", subtitle: nil,
                    contactDisplayName: "Grand Levent Hotel", description: nil),
        Transaction(id: "t-04", kind: .expense, status: .paid, amount: 18_500, currency: "TRY",
                    amountBase: 18_500, occurredOn: date(day: 4),
                    title: nil, category: "Transfer", subtitle: "Havalimanı → otel",
                    contactDisplayName: "Mavi Transfer", description: nil),
        Transaction(id: "t-05", kind: .income, status: .partial, amount: 280_000, currency: "EUR",
                    amountBase: 13_160_000, occurredOn: date(day: 7),
                    title: "İmplant paketi", category: "Tedavi geliri", subtitle: "Diş",
                    contactDisplayName: "Ahmet Yıldırım", description: nil),
        Transaction(id: "t-06", kind: .expense, status: .paid, amount: 1_250_000, currency: "TRY",
                    amountBase: 1_250_000, occurredOn: date(day: 9),
                    title: "Eylül reklam harcaması", category: "Pazarlama", subtitle: "Meta Ads",
                    contactDisplayName: "Meta Ads", description: nil),
        Transaction(id: "t-07", kind: .income, status: .unpaid, amount: 195_000, currency: "GBP",
                    amountBase: nil, occurredOn: date(day: 11),
                    title: nil, category: "Tedavi geliri", subtitle: "Saç ekimi",
                    contactDisplayName: "Marek Kowalski", description: "Kalan bakiye kliniğe\nkapıda ödenecek"),
        Transaction(id: "t-08", kind: .expense, status: .unpaid, amount: 64_000, currency: "TRY",
                    amountBase: 64_000, occurredOn: date(day: 12),
                    title: "Sarf malzeme", category: "Tedarik", subtitle: nil,
                    contactDisplayName: "Medikal Sarf Deposu", description: nil),
        Transaction(id: "t-09", kind: .income, status: .paid, amount: 415_000, currency: "EUR",
                    amountBase: 19_505_000, occurredOn: date(day: 14),
                    title: "Tam ağız tedavi", category: "Tedavi geliri", subtitle: "Diş",
                    contactDisplayName: "Fatima Al Rashid", description: nil),
        Transaction(id: "t-10", kind: .expense, status: .partial, amount: 310_000, currency: "TRY",
                    amountBase: 310_000, occurredOn: date(day: 15),
                    title: nil, category: "Klinik hakediş", subtitle: "Nişantaşı Dental",
                    contactDisplayName: "Nişantaşı Dental Center", description: nil),
        Transaction(id: "t-11", kind: .income, status: .paid, amount: 152_000, currency: "TRY",
                    amountBase: 152_000, occurredOn: date(day: 18),
                    title: "Kontrol ücreti", category: "Tedavi geliri", subtitle: "Takip",
                    contactDisplayName: "Elena Petrova", description: nil),
        Transaction(id: "t-12", kind: .expense, status: .paid, amount: 42_500, currency: "TRY",
                    amountBase: 42_500, occurredOn: date(day: 21),
                    title: nil, category: "Transfer", subtitle: "Otel → klinik",
                    contactDisplayName: "VIP Yol Transfer", description: nil),
        Transaction(id: "t-13", kind: .expense, status: .paid, amount: 128_000, currency: "TRY",
                    amountBase: 128_000, occurredOn: date(day: 24),
                    title: "Konaklama 2 gece", category: "Otel", subtitle: nil,
                    contactDisplayName: "Taksim Suites", description: nil),
        // Geçen aylar — aylık grafik altı kova gösteriyor.
        Transaction(id: "t-14", kind: .income, status: .paid, amount: 8_450_000, currency: "TRY",
                    amountBase: 8_450_000, occurredOn: date(monthOffset: -1, day: 12),
                    title: nil, category: "Tedavi geliri", subtitle: "Saç ekimi",
                    contactDisplayName: "Fatima Al Rashid", description: nil),
        Transaction(id: "t-15", kind: .expense, status: .paid, amount: 3_920_000, currency: "TRY",
                    amountBase: 3_920_000, occurredOn: date(monthOffset: -1, day: 19),
                    title: nil, category: "Klinik hakediş", subtitle: "Estetik International",
                    contactDisplayName: "Estetik International Klinik", description: nil),
        Transaction(id: "t-16", kind: .income, status: .paid, amount: 6_120_000, currency: "TRY",
                    amountBase: 6_120_000, occurredOn: date(monthOffset: -2, day: 8),
                    title: nil, category: "Tedavi geliri", subtitle: "Diş",
                    contactDisplayName: "Ahmet Yıldırım", description: nil),
        Transaction(id: "t-17", kind: .expense, status: .paid, amount: 2_480_000, currency: "TRY",
                    amountBase: 2_480_000, occurredOn: date(monthOffset: -2, day: 22),
                    title: "Ağustos reklam harcaması", category: "Pazarlama", subtitle: "Meta Ads",
                    contactDisplayName: "Meta Ads", description: nil),
        Transaction(id: "t-18", kind: .income, status: .paid, amount: 7_340_000, currency: "TRY",
                    amountBase: 7_340_000, occurredOn: date(monthOffset: -3, day: 15),
                    title: nil, category: "Tedavi geliri", subtitle: "Saç ekimi",
                    contactDisplayName: "Marek Kowalski", description: nil),
        Transaction(id: "t-19", kind: .expense, status: .paid, amount: 3_010_000, currency: "TRY",
                    amountBase: 3_010_000, occurredOn: date(monthOffset: -3, day: 27),
                    title: nil, category: "Otel", subtitle: nil,
                    contactDisplayName: "Grand Levent Hotel", description: nil),
        Transaction(id: "t-20", kind: .income, status: .paid, amount: 5_680_000, currency: "TRY",
                    amountBase: 5_680_000, occurredOn: date(monthOffset: -4, day: 10),
                    title: nil, category: "Tedavi geliri", subtitle: "Diş",
                    contactDisplayName: "Sandra Whitfield", description: nil),
        Transaction(id: "t-21", kind: .expense, status: .paid, amount: 2_150_000, currency: "TRY",
                    amountBase: 2_150_000, occurredOn: date(monthOffset: -4, day: 20),
                    title: nil, category: "Pazarlama", subtitle: "Meta Ads",
                    contactDisplayName: "Meta Ads", description: nil),
        Transaction(id: "t-22", kind: .income, status: .paid, amount: 4_910_000, currency: "TRY",
                    amountBase: 4_910_000, occurredOn: date(monthOffset: -5, day: 6),
                    title: nil, category: "Tedavi geliri", subtitle: "Saç ekimi",
                    contactDisplayName: "Elena Petrova", description: nil),
        Transaction(id: "t-23", kind: .expense, status: .paid, amount: 1_870_000, currency: "TRY",
                    amountBase: 1_870_000, occurredOn: date(monthOffset: -5, day: 24),
                    title: nil, category: "Klinik hakediş", subtitle: "Nişantaşı Dental",
                    contactDisplayName: "Nişantaşı Dental Center", description: nil)
    ]

    // MARK: Bakiyeler

    static let balances: [Balance] = [
        Balance(id: "b-01", contactLabel: "Estetik International Klinik", currency: "TRY",
                net: -1_840_000, oldestOpenDays: 42),
        Balance(id: "b-02", contactLabel: "Marek Kowalski", currency: "GBP",
                net: 195_000, oldestOpenDays: 12),
        Balance(id: "b-03", contactLabel: "Medikal Sarf Deposu", currency: "TRY",
                net: -64_000, oldestOpenDays: 9),
        Balance(id: "b-04", contactLabel: "Ahmet Yıldırım", currency: "EUR",
                net: 140_000, oldestOpenDays: 21)
    ]

    // MARK: WhatsApp kuyruğu

    static let inboundMessages: [InboundMessage] = [
        InboundMessage(
            id: "m-01",
            sender: "+90 532 415 88 20",
            body: """
            Sandra 2900 GBP 2. vizit ödemesi + 450 GBP t-base ücretleri alındı.
            Toplamda 3.350 GBP kart ile ödeme alındı.
            """,
            status: .new,
            hasMedia: false,
            createdAt: date(day: 3, hour: 18, minute: 12)
        ),
        InboundMessage(
            id: "m-02",
            sender: "+90 533 660 22 14",
            body: "Bugün otelden kliniğe 3 transfer yapıldı, toplam 1850 TL.",
            status: .parsed,
            hasMedia: false,
            createdAt: date(day: 4, hour: 20, minute: 45)
        ),
        InboundMessage(
            id: "m-03",
            sender: "+90 542 118 09 77",
            body: nil,
            status: .new,
            hasMedia: true,
            createdAt: date(day: 5, hour: 9, minute: 5)
        )
    ]

    /// `m-01` mesajından çıkarılan taslaklar (sahte AI çıktısı).
    static let draftsForFirstMessage: [TransactionDraft] = [
        TransactionDraft(kind: .income, amount: 290_000, currency: "GBP",
                         title: "2. vizit ödemesi", category: "Tedavi geliri",
                         contactLabel: "Sandra Whitfield",
                         occurredOn: date(day: 3), paymentMethod: "Kart"),
        TransactionDraft(kind: .income, amount: 45_000, currency: "GBP",
                         title: "T-base ücretleri", category: "Tedavi geliri",
                         contactLabel: "Sandra Whitfield",
                         occurredOn: date(day: 3), paymentMethod: "Kart")
    ]

    /// `m-02` mesajından çıkarılan taslak.
    static let draftsForSecondMessage: [TransactionDraft] = [
        TransactionDraft(kind: .expense, amount: 185_000, currency: "TRY",
                         title: "Otel → klinik transferi (3 adet)", category: "Transfer",
                         contactLabel: "Mavi Transfer",
                         occurredOn: date(day: 4), paymentMethod: "Nakit")
    ]

    static func drafts(for messageId: String) -> [TransactionDraft] {
        switch messageId {
        case "m-01": return draftsForFirstMessage
        case "m-02": return draftsForSecondMessage
        default: return []
        }
    }

    // MARK: Tutarlılık uyarıları (rapor)

    static let consistencyIssues: [String] = [
        "Marek Kowalski · 1.950,00 GBP — ödeme durumu \"Ödenmedi\" ama randevu tamamlandı.",
        "Medikal Sarf Deposu · 640,00 ₺ — kategori seçili değil, işlem \"Tedarik\" varsayıldı."
    ]
}
