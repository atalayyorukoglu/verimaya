import Foundation

/*
 Ekran modelleri.

 Bunlar API modeli DEĞİL — mockup ekranlarının ihtiyaç duyduğu alanlar.
 Alan adları yine de sunucu sözleşmesini izler (`packages/shared`), böylece ağ
 katmanı geldiğinde eşleme birebir olur. Ağ turunda bu dosya `Codable`
 karşılıklarıyla değiştirilir; ekranlar aynı kalır.

 Not (arşiv dersi #3): sunucuda "hasta" varlığı yok — herkes bir KİŞİ,
 ayrım `contact_type` ile. Bu model de öyle kurulu.
*/

// MARK: - Kişi

enum ContactStatus: String, CaseIterable {
    case scheduled, arrived, treated, follow_up, cancelled

    var label: String { S.Labels.contactStatus[rawValue] ?? rawValue }
}

struct ContactType: Identifiable, Hashable {
    let id: String
    let name: String
}

struct Contact: Identifiable, Hashable {
    let id: String
    let displayName: String
    let typeId: String
    let phone: String?
    let email: String?
    /// Yalnız Hasta tipinde dolu (arşiv dersi #3).
    let status: ContactStatus?
}

// MARK: - Randevu

enum AppointmentStatus: String, CaseIterable {
    case scheduled, confirmed, in_progress, completed, cancelled, no_show

    var label: String { S.Labels.appointmentStatus[rawValue] ?? rawValue }
}

struct Appointment: Identifiable, Hashable {
    let id: String
    let contactId: String
    let contactDisplayName: String
    let startsAt: Date
    let endsAt: Date?
    let status: AppointmentStatus
    /// Tenant sözlüğünden serbest metin: "RPT", "Devam", "Yeni Hasta"…
    let appointmentType: String?
    let clinicName: String?
    let hotelName: String?
    let transferNote: String?
    let doctorName: String?
}

// MARK: - İşlem

enum TransactionKind: String, CaseIterable {
    case income, expense

    var label: String { S.Labels.transactionKind[rawValue] ?? rawValue }
}

enum TransactionStatus: String, CaseIterable {
    case paid, partial, unpaid

    var label: String { S.Labels.transactionStatus[rawValue] ?? rawValue }
}

struct Transaction: Identifiable, Hashable {
    let id: String
    let kind: TransactionKind
    let status: TransactionStatus
    /// Minor unit (kuruş/cent) integer — AGENTS.md kuralı.
    let amount: Int
    let currency: String
    /// Baz para birimi karşılığı; kur bilinmiyorsa nil.
    let amountBase: Int?
    let occurredOn: Date
    let title: String?
    let category: String?
    let subtitle: String?
    let contactDisplayName: String?
    let description: String?

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

// MARK: - Bakiye

struct Balance: Identifiable, Hashable {
    let id: String
    let contactLabel: String
    let currency: String
    /// Pozitif = alacağımız, negatif = borcumuz (web'deki net gösterimle aynı yön).
    let net: Int
    let oldestOpenDays: Int?
}

// MARK: - WhatsApp kuyruğu

enum InboundMessageStatus: String {
    case new, parsed, approved, ignored

    var label: String { S.Labels.inboundMessageStatus[rawValue] ?? rawValue }
}

struct InboundMessage: Identifiable, Hashable {
    let id: String
    let sender: String
    let body: String?
    let status: InboundMessageStatus
    let hasMedia: Bool
    let createdAt: Date
}

/// AI'ın mesajdan çıkardığı taslak işlem — insan onayı olmadan kayda geçmez (ilke 6).
struct TransactionDraft: Identifiable, Hashable {
    let id: String
    let kind: TransactionKind
    let amount: Int
    let currency: String
    let title: String
    let category: String?
    let contactDisplayName: String?
    let occurredOn: Date
    let paymentMethod: String?
}

// MARK: - Yardımcılar

extension StringProtocol {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
