import Foundation

/*
 Ekran modelleri — artık aynı zamanda API modelleri.

 Alan adları sunucu sözleşmesini (`packages/shared`) izler; JSON snake_case'ten
 `convertFromSnakeCase` ile çözülür, farklı adlandırdığımız yerlerde `CodingKeys`
 açıkça yazılıdır.

 Arşiv dersi #3: sunucuda "hasta" varlığı YOK — herkes bir KİŞİ (`/v1/contacts`),
 ayrım `contact_type` ile. `display_name` sunucuda ad+soyaddan türetilir ve
 istekle GÖNDERİLMEZ. Yeni kişide `contact_type_id` zorunlu, durum opsiyoneldir
 (yalnız Hasta tipinde dolu).
*/

// MARK: - Tarih çözümleme

enum APIDate {
    /// `2026-09-12T15:00:00.000Z` (kesirli saniyeli ve saniyesiz iki biçim de gelir).
    private static let isoFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let iso: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    /// `2026-09-04` — takvim günü (naive `occurred_on` sütunu).
    private static let dayKey: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = VMFormat.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func timestamp(_ value: String) -> Date? {
        isoFractional.date(from: value) ?? iso.date(from: value)
    }

    static func day(_ value: String) -> Date? {
        if value.count == 10 { return dayKey.date(from: value) }
        return timestamp(value)
    }

    /// Sunucuya gün anahtarı olarak yazılır (`from`, `to`, `occurred_on`).
    static func dayKeyString(_ date: Date) -> String {
        dayKey.string(from: date)
    }
}

private extension KeyedDecodingContainer {
    func decodeTimestamp(_ key: Key) throws -> Date {
        let raw = try decode(String.self, forKey: key)
        guard let date = APIDate.timestamp(raw) else {
            throw DecodingError.dataCorruptedError(forKey: key, in: self,
                                                   debugDescription: "Geçersiz zaman damgası: \(raw)")
        }
        return date
    }

    func decodeTimestampIfPresent(_ key: Key) throws -> Date? {
        guard let raw = try decodeIfPresent(String.self, forKey: key) else { return nil }
        return APIDate.timestamp(raw)
    }

    func decodeDay(_ key: Key) throws -> Date {
        let raw = try decode(String.self, forKey: key)
        guard let date = APIDate.day(raw) else {
            throw DecodingError.dataCorruptedError(forKey: key, in: self,
                                                   debugDescription: "Geçersiz tarih: \(raw)")
        }
        return date
    }
}

// MARK: - Sayfa zarfları

/*
 Arşiv dersi #1 — SAYAÇLAR SUNUCUDAN.

 Liste yanıtı `{ items, next_cursor, total_count }` döner. `total_count` veri
 kümesinin TAMAMIDIR; yüklü satırları saymak yanlıştır (panel "51 kişi" derken
 uygulama "1 kişi" diyordu). `totalCount` bu yüzden çözümlenir ve ekranlarda
 doğrudan o gösterilir.
*/
struct CursorPage<T: Decodable>: Decodable {
    let items: [T]
    let nextCursor: String?
    let totalCount: Int?
}

/// Randevu listesinin zarfı `total_count` TAŞIMAZ; sayaç `status_counts`
/// toplamıdır (web `+page.svelte` de aynısını yapıyor).
struct AppointmentPage: Decodable {
    let items: [Appointment]
    let nextCursor: String?
    let statusCounts: [String: Int]?
    let typeCounts: [String: Int]?

    var totalCount: Int? {
        guard let statusCounts else { return nil }
        return statusCounts.values.reduce(0, +)
    }
}

/// Basit `{ items: [...] }` zarfı (sözlükler, bakiyeler, organizasyonlar).
struct ItemsEnvelope<T: Decodable>: Decodable {
    let items: [T]
}

/// Arşiv dersi #5: WhatsApp gelen kutusu zarfı `items` DEĞİL, `messages`.
struct InboxEnvelope: Decodable {
    let messages: [InboundMessage]
}

// MARK: - Oturum sahibi

/*
 Arşiv dersi #4: `GET /v1/me` DÜZ nesne döner (`email`, `display_name`,
 `tenant_id`, `role`, `preferences`) — better-auth'un `user`/`session`
 sarmalayıcısı YOKTUR.
*/
struct Me: Decodable, Equatable {
    let id: String
    let email: String
    let displayName: String
    let tenantId: String?
    let role: String?
    let platformAdmin: Bool?
}

struct Tenant: Decodable, Equatable {
    let id: String
    let name: String
    let baseCurrency: String
    let timezone: String
}

struct MeOrganization: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let slug: String?
}

// MARK: - Kişi

enum ContactStatus: String, CaseIterable, Codable {
    case scheduled, arrived, treated, follow_up, cancelled

    var label: String { S.Labels.contactStatus[rawValue] ?? rawValue }
}

struct ContactType: Identifiable, Hashable, Decodable {
    let id: String
    let name: String
    let sortOrder: Int?

    init(id: String, name: String, sortOrder: Int? = nil) {
        self.id = id
        self.name = name
        self.sortOrder = sortOrder
    }
}

struct Contact: Identifiable, Hashable, Decodable {
    let id: String
    let displayName: String
    let firstName: String
    let lastName: String?
    let typeId: String
    let typeName: String?
    let phone: String?
    let email: String?
    /// Yalnız Hasta tipinde dolu (arşiv dersi #3).
    let status: ContactStatus?

    enum CodingKeys: String, CodingKey {
        case id
        case displayName
        case firstName
        case lastName
        case typeId = "contactTypeId"
        case typeName = "contactTypeName"
        case phone, email, status
    }

    init(
        id: String,
        displayName: String,
        firstName: String = "",
        lastName: String? = nil,
        typeId: String,
        typeName: String? = nil,
        phone: String?,
        email: String?,
        status: ContactStatus?
    ) {
        self.id = id
        self.displayName = displayName
        self.firstName = firstName
        self.lastName = lastName
        self.typeId = typeId
        self.typeName = typeName
        self.phone = phone
        self.email = email
        self.status = status
    }
}

/// `POST /v1/contacts` gövdesi. `display_name` YOK — sunucu türetir.
struct ContactCreate: Encodable {
    let firstName: String
    let lastName: String?
    let contactTypeId: String
    let phone: String?
    let email: String?
    let status: String?
}

/// `PATCH /v1/contacts/:id` gövdesi (kısmi).
struct ContactUpdate: Encodable {
    let firstName: String?
    let lastName: String?
    let contactTypeId: String?
    let phone: String?
    let email: String?
    let status: String?
}

// MARK: - Randevu

enum AppointmentStatus: String, CaseIterable, Codable {
    case scheduled, confirmed, in_progress, completed, cancelled, no_show

    var label: String { S.Labels.appointmentStatus[rawValue] ?? rawValue }
}

struct Appointment: Identifiable, Hashable, Decodable {
    let id: String
    let contactId: String
    let contactDisplayName: String
    let startsAt: Date
    let endsAt: Date?
    let status: AppointmentStatus
    /// Kiracı sözlüğünden serbest metin: "RPT", "Devam Hastası", "Yeni Hasta"…
    let appointmentType: String?
    let clinicName: String?
    let hotelName: String?
    let transferNote: String?

    enum CodingKeys: String, CodingKey {
        case id, contactId, contactDisplayName, startsAt, endsAt, status
        case appointmentType, clinicName, hotelName, transferNote
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        contactId = try container.decode(String.self, forKey: .contactId)
        contactDisplayName = try container.decodeIfPresent(String.self, forKey: .contactDisplayName) ?? "—"
        startsAt = try container.decodeTimestamp(.startsAt)
        endsAt = try container.decodeTimestampIfPresent(.endsAt)
        status = try container.decode(AppointmentStatus.self, forKey: .status)
        appointmentType = try container.decodeIfPresent(String.self, forKey: .appointmentType)
        clinicName = try container.decodeIfPresent(String.self, forKey: .clinicName)
        hotelName = try container.decodeIfPresent(String.self, forKey: .hotelName)
        transferNote = try container.decodeIfPresent(String.self, forKey: .transferNote)
    }

    init(
        id: String,
        contactId: String,
        contactDisplayName: String,
        startsAt: Date,
        endsAt: Date?,
        status: AppointmentStatus,
        appointmentType: String?,
        clinicName: String?,
        hotelName: String?,
        transferNote: String?
    ) {
        self.id = id
        self.contactId = contactId
        self.contactDisplayName = contactDisplayName
        self.startsAt = startsAt
        self.endsAt = endsAt
        self.status = status
        self.appointmentType = appointmentType
        self.clinicName = clinicName
        self.hotelName = hotelName
        self.transferNote = transferNote
    }
}

struct AppointmentWrite: Encodable {
    let contactId: String
    let startsAt: String
    let endsAt: String?
    let status: String
    let appointmentType: String?
    let clinicName: String?
    let hotelName: String?
    let transferNote: String?
}

struct AppointmentTypeSetting: Identifiable, Hashable, Decodable {
    let id: String
    let name: String
    let sortOrder: Int?
}

// MARK: - İşlem

enum TransactionKind: String, CaseIterable, Codable {
    case income, expense

    var label: String { S.Labels.transactionKind[rawValue] ?? rawValue }
}

enum TransactionStatus: String, CaseIterable, Codable {
    case paid, partial, unpaid

    var label: String { S.Labels.transactionStatus[rawValue] ?? rawValue }
}

struct Transaction: Identifiable, Hashable, Decodable {
    let id: String
    let kind: TransactionKind
    let status: TransactionStatus
    /// Minor unit (kuruş/cent) integer — AGENTS.md kuralı.
    let amount: Int
    let currency: String
    /// Baz para birimi karşılığı; kur bilinmiyorsa nil (raporlara dahil edilmez).
    let amountBase: Int?
    let occurredOn: Date
    let title: String?
    let category: String?
    let subtitle: String?
    let contactId: String?
    let contactDisplayName: String?
    let description: String?

    enum CodingKeys: String, CodingKey {
        case id, kind, status, amount, currency, amountBase, occurredOn
        case title, category, subtitle, contactId, contactDisplayName, description
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        kind = try container.decode(TransactionKind.self, forKey: .kind)
        status = try container.decode(TransactionStatus.self, forKey: .status)
        amount = try container.decode(Int.self, forKey: .amount)
        currency = try container.decode(String.self, forKey: .currency)
        amountBase = try container.decodeIfPresent(Int.self, forKey: .amountBase)
        occurredOn = try container.decodeDay(.occurredOn)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        category = try container.decodeIfPresent(String.self, forKey: .category)
        subtitle = try container.decodeIfPresent(String.self, forKey: .subtitle)
        contactId = try container.decodeIfPresent(String.self, forKey: .contactId)
        contactDisplayName = try container.decodeIfPresent(String.self, forKey: .contactDisplayName)
        description = try container.decodeIfPresent(String.self, forKey: .description)
    }

    init(
        id: String,
        kind: TransactionKind,
        status: TransactionStatus,
        amount: Int,
        currency: String,
        amountBase: Int?,
        occurredOn: Date,
        title: String?,
        category: String?,
        subtitle: String?,
        contactId: String? = nil,
        contactDisplayName: String?,
        description: String?
    ) {
        self.id = id
        self.kind = kind
        self.status = status
        self.amount = amount
        self.currency = currency
        self.amountBase = amountBase
        self.occurredOn = occurredOn
        self.title = title
        self.category = category
        self.subtitle = subtitle
        self.contactId = contactId
        self.contactDisplayName = contactDisplayName
        self.description = description
    }

    /// `deriveTransactionLabel` (packages/shared/src/transaction.ts) karşılığı:
    /// title → kategori › alt başlık → kişi → açıklamanın ilk satırı → —.
    var derivedLabel: String {
        if let title = title?.trimmed, !title.isEmpty { return title }
        let category = category?.trimmed ?? ""
        let subtitle = subtitle?.trimmed ?? ""
        if !category.isEmpty && !subtitle.isEmpty { return "\(category) › \(subtitle)" }
        if !category.isEmpty { return category }
        if !subtitle.isEmpty { return subtitle }
        if let contact = contactDisplayName?.trimmed, !contact.isEmpty { return contact }
        if let first = description?.split(separator: "\n").first?.trimmed, !first.isEmpty {
            return first
        }
        return "—"
    }
}

struct TransactionWrite: Encodable {
    let kind: String
    let status: String
    let amount: Int
    let currency: String
    let occurredOn: String
    let title: String?
    let category: String?
    let contactId: String?
    let paidAmount: Int?
}

// MARK: - Bakiye (`GET /v1/reports/balances`)

struct Balance: Identifiable, Hashable, Decodable {
    let contactId: String?
    let contactLabel: String
    let currency: String
    /// `open_amount`: negatif = bizim borcumuz, pozitif = alacağımız (web ile aynı yön).
    let net: Int
    let oldestOpenDays: Int?

    var id: String { "\(contactId ?? "-")-\(currency)" }

    enum CodingKeys: String, CodingKey {
        case contactId, contactLabel, currency
        case net = "openAmount"
        case oldestOpenDays
    }

    init(id: String = "", contactLabel: String, currency: String, net: Int, oldestOpenDays: Int?) {
        self.contactId = id.isEmpty ? nil : id
        self.contactLabel = contactLabel
        self.currency = currency
        self.net = net
        self.oldestOpenDays = oldestOpenDays
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        contactId = try container.decodeIfPresent(String.self, forKey: .contactId)
        contactLabel = try container.decodeIfPresent(String.self, forKey: .contactLabel) ?? "—"
        currency = try container.decode(String.self, forKey: .currency)
        net = try container.decode(Int.self, forKey: .net)
        oldestOpenDays = try container.decodeIfPresent(Int.self, forKey: .oldestOpenDays)
    }
}

// MARK: - WhatsApp kuyruğu

enum InboundMessageStatus: String, Codable {
    case new, parsed, approved, ignored

    var label: String { S.Labels.inboundMessageStatus[rawValue] ?? rawValue }
}

struct InboundMessage: Identifiable, Hashable, Decodable {
    let id: String
    let sender: String
    let chatName: String?
    let body: String?
    let status: InboundMessageStatus
    let hasMedia: Bool
    let groupId: String?
    let createdAt: Date
    let parsedRecords: [TransactionDraft]?

    enum CodingKeys: String, CodingKey {
        case id, sender, chatName, body, status, hasMedia, groupId, createdAt, parsedRecords
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        sender = try container.decodeIfPresent(String.self, forKey: .sender) ?? "—"
        chatName = try container.decodeIfPresent(String.self, forKey: .chatName)
        body = try container.decodeIfPresent(String.self, forKey: .body)
        status = try container.decode(InboundMessageStatus.self, forKey: .status)
        hasMedia = try container.decodeIfPresent(Bool.self, forKey: .hasMedia) ?? false
        groupId = try container.decodeIfPresent(String.self, forKey: .groupId)
        createdAt = try container.decodeTimestamp(.createdAt)
        parsedRecords = try container.decodeIfPresent([TransactionDraft].self, forKey: .parsedRecords)
    }

    init(
        id: String,
        sender: String,
        chatName: String? = nil,
        body: String?,
        status: InboundMessageStatus,
        hasMedia: Bool,
        groupId: String? = nil,
        createdAt: Date,
        parsedRecords: [TransactionDraft]? = nil
    ) {
        self.id = id
        self.sender = sender
        self.chatName = chatName
        self.body = body
        self.status = status
        self.hasMedia = hasMedia
        self.groupId = groupId
        self.createdAt = createdAt
        self.parsedRecords = parsedRecords
    }
}

/*
 AI'ın mesajdan çıkardığı taslak işlem.

 AGENTS.md ilke 6: AI çıkarımı TASLAKTIR — insan onayı olmadan kesin kayda
 yazılmaz. Sunucu bu kayıtları `parsed_records` içinde ID'siz döndürür; listede
 kimliklendirmek için sıra numarası üretiyoruz.
*/
struct TransactionDraft: Hashable, Identifiable, Decodable {
    var localId = UUID()
    let kind: TransactionKind
    let amount: Int
    let currency: String
    let title: String?
    let category: String?
    let contactLabel: String?
    let occurredOn: Date?
    let paymentMethod: String?

    var id: UUID { localId }

    /// Ekranda gösterilecek ad — başlık yoksa karşı taraf.
    var displayTitle: String {
        if let title = title?.trimmed, !title.isEmpty { return title }
        return contactLabel?.trimmed ?? "—"
    }

    enum CodingKeys: String, CodingKey {
        case kind, amount, currency, title, category, contactLabel, occurredOn, paymentMethod
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decode(TransactionKind.self, forKey: .kind)
        amount = try container.decode(Int.self, forKey: .amount)
        currency = try container.decode(String.self, forKey: .currency)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        category = try container.decodeIfPresent(String.self, forKey: .category)
        contactLabel = try container.decodeIfPresent(String.self, forKey: .contactLabel)
        if let raw = try container.decodeIfPresent(String.self, forKey: .occurredOn) {
            occurredOn = APIDate.day(raw)
        } else {
            occurredOn = nil
        }
        paymentMethod = try container.decodeIfPresent(String.self, forKey: .paymentMethod)
    }

    init(
        kind: TransactionKind,
        amount: Int,
        currency: String,
        title: String?,
        category: String?,
        contactLabel: String?,
        occurredOn: Date?,
        paymentMethod: String?
    ) {
        self.kind = kind
        self.amount = amount
        self.currency = currency
        self.title = title
        self.category = category
        self.contactLabel = contactLabel
        self.occurredOn = occurredOn
        self.paymentMethod = paymentMethod
    }
}

struct InboxParseResponse: Decodable {
    let records: [TransactionDraft]
}

// MARK: - Raporlar

struct ReportPeriod: Decodable, Hashable {
    let from: String?
    let to: String?
}

struct ReportSummary: Decodable {
    let incomeBase: Int
    let expenseBase: Int
    let netBase: Int
    let pendingBase: Int
    let transactionCount: Int
    let fxMissingCount: Int?
}

struct ReportAppointmentMetrics: Decodable {
    struct ClinicRow: Decodable, Hashable {
        let clinicName: String
        let count: Int
        let completionRate: Double
    }
    struct TypeRow: Decodable, Hashable {
        let appointmentType: String
        let count: Int
        let ratio: Double
    }
    struct MonthlyRow: Decodable, Hashable {
        let month: String
        let count: Int
    }

    let total: Int
    let completionRate: Double
    let noShowRate: Double
    let cancellationRate: Double
    let byClinic: [ClinicRow]
    let byAppointmentType: [TypeRow]
    let monthly: [MonthlyRow]?
}

struct ReportByCategory: Decodable {
    struct Row: Decodable, Hashable {
        let categoryName: String
        let incomeBase: Int
        let expenseBase: Int
        let netBase: Int
        let transactionCount: Int
    }
    let items: [Row]
}

struct ReportMonthly: Decodable {
    struct Row: Decodable, Hashable {
        let month: String
        let incomeBase: Int
        let expenseBase: Int
        let netBase: Int
        let transactionCount: Int
    }
    let items: [Row]
}

struct ReportContactDistribution: Decodable {
    struct StatusRow: Decodable, Hashable {
        let status: ContactStatus
        let count: Int
    }
    let byStatus: [StatusRow]
    let total: Int
}

struct ReportConsistency: Decodable {
    struct Issue: Decodable, Hashable, Identifiable {
        let transactionId: String
        let title: String?
        let occurredOn: String?
        let severity: String
        let code: String
        let messageKey: String

        var id: String { "\(transactionId)-\(code)" }

        /// `messageKey` katalogdan çözülür; bilinmeyen anahtar ham kodla gösterilir.
        var message: String { S.Reports.Consistency.messages[code] ?? code }
    }
    let items: [Issue]
}

struct MarketingReport: Decodable {
    let spendBase: Int?
    let revenueBase: Int?
    let realRoas: Double?
    let leadsCount: Int?
    let treatedCount: Int?
    let spendFxMissing: Bool?
    let attributionMissing: Bool?
    let attributionCoverage: Double?
}

// MARK: - Yardımcılar

extension StringProtocol {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
