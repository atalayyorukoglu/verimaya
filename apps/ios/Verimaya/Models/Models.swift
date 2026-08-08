import Foundation

// MARK: - Shared enums (mirror packages/shared zod contracts)

enum PatientStatus: String, Codable, CaseIterable, Identifiable {
  case lead, contacted, qualified, scheduled, arrived, treated
  case followUp = "follow_up"
  case closedWon = "closed_won"
  case closedLost = "closed_lost"
  var id: String { rawValue }
  var label: String {
    switch self {
    case .lead: "Lead"
    case .contacted: "İletişim kuruldu"
    case .qualified: "Nitelikli"
    case .scheduled: "Planlandı"
    case .arrived: "Geldi"
    case .treated: "Tedavi edildi"
    case .followUp: "Takip"
    case .closedWon: "Kazanıldı"
    case .closedLost: "Kaybedildi"
    }
  }
}

enum AppointmentStatus: String, Codable, CaseIterable, Identifiable {
  case scheduled, confirmed
  case inProgress = "in_progress"
  case completed, cancelled
  case noShow = "no_show"
  var id: String { rawValue }
  var label: String {
    switch self {
    case .scheduled: "Planlandı"
    case .confirmed: "Onaylandı"
    case .inProgress: "Devam ediyor"
    case .completed: "Tamamlandı"
    case .cancelled: "İptal"
    case .noShow: "Gelmedi"
    }
  }
}

enum TransactionKind: String, Codable, CaseIterable, Identifiable {
  case income, expense
  var id: String { rawValue }
  var label: String { self == .income ? "Gelir" : "Gider" }
}

enum TransactionStatus: String, Codable, CaseIterable, Identifiable {
  case paid, partial, unpaid
  var id: String { rawValue }
  var label: String {
    switch self {
    case .paid: "Ödendi"
    case .partial: "Kısmi"
    case .unpaid: "Ödenmedi"
    }
  }
}

enum InvoiceStatus: String, Codable, CaseIterable, Identifiable {
  case none
  case issued
  case notIssued = "not_issued"
  var id: String { rawValue }
  var label: String {
    switch self {
    case .none: "Fatura yok"
    case .issued: "Kesildi"
    case .notIssued: "Kesilmedi"
    }
  }
}

enum SupportedCurrency: String, Codable, CaseIterable, Identifiable {
  case TRY, GBP, EUR, USD
  var id: String { rawValue }
}

// MARK: - Cursor pagination envelope

struct CursorPage<T: Decodable>: Decodable {
  let items: [T]
  let nextCursor: String?
}

// MARK: - Patients

struct Patient: Decodable, Identifiable, Hashable {
  let id: String
  let tenantId: String
  let fullName: String
  let phone: String?
  let email: String?
  let status: PatientStatus
  let source: String?
  let notes: String?
  let assignedUserId: String?
  let contactId: String?
  let createdAt: String
  let updatedAt: String
}

struct PatientCreate: Encodable {
  var fullName: String
  var phone: String?
  var email: String?
  var status: PatientStatus = .lead
  var source: String?
  var notes: String?
  var assignedUserId: String?
  var contactId: String?
}

/// PATCH partial — nil fields are omitted (unchanged).
struct PatientUpdate: Encodable {
  var fullName: String?
  var phone: String?
  var email: String?
  var status: PatientStatus?
  var source: String?
  var notes: String?
  var assignedUserId: String?
  var contactId: String?
}

struct PatientFinanceSummary: Decodable {
  let incomeBase: Int
  let expenseBase: Int
  let paidBase: Int
  let outstandingBase: Int
  let transactionCount: Int
}

// MARK: - Appointments

struct Appointment: Decodable, Identifiable, Hashable {
  let id: String
  let tenantId: String
  let patientId: String
  let patientDisplayName: String
  let title: String?
  let appointmentType: String?
  let status: AppointmentStatus
  let startsAt: String
  let endsAt: String?
  let clinicName: String?
  let hotelName: String?
  let transferNote: String?
  let clinicContactId: String?
  let hotelContactId: String?
  let transferContactId: String?
  let notes: String?
  let createdAt: String
  let updatedAt: String
}

struct AppointmentCreate: Encodable {
  var patientId: String
  var title: String?
  var appointmentType: String?
  var status: AppointmentStatus = .scheduled
  var startsAt: String
  var endsAt: String?
  var clinicName: String?
  var hotelName: String?
  var transferNote: String?
  var clinicContactId: String?
  var hotelContactId: String?
  var transferContactId: String?
  var notes: String?
}

struct AppointmentUpdate: Encodable {
  var patientId: String?
  var title: String?
  var appointmentType: String?
  var status: AppointmentStatus?
  var startsAt: String?
  var endsAt: String?
  var clinicName: String?
  var hotelName: String?
  var transferNote: String?
  var clinicContactId: String?
  var hotelContactId: String?
  var transferContactId: String?
  var notes: String?
}

// MARK: - Transactions

struct Transaction: Decodable, Identifiable, Hashable {
  let id: String
  let tenantId: String
  let kind: TransactionKind
  let title: String
  let subtitle: String?
  let category: String?
  let occurredOn: String
  let status: TransactionStatus
  let invoiceStatus: InvoiceStatus
  let paymentMethod: String?
  let amount: Int
  let paidAmount: Int?
  let currency: SupportedCurrency
  let amountBase: Int?
  let baseCurrency: SupportedCurrency?
  let fxRate: Double?
  let fxDated: String?
  let patientId: String?
  let patientDisplayName: String?
  let contactId: String?
  let contactLabel: String?
  let description: String?
  let createdAt: String
  let updatedAt: String
}

struct TransactionCreate: Encodable {
  var kind: TransactionKind
  var title: String
  var subtitle: String?
  var category: String?
  var occurredOn: String            // YYYY-MM-DD
  var status: TransactionStatus
  var invoiceStatus: InvoiceStatus = .none
  var paymentMethod: String?
  var amount: Int                    // minor units
  var paidAmount: Int?
  var currency: SupportedCurrency = .TRY
  var amountBase: Int?
  var baseCurrency: SupportedCurrency?
  var fxRate: Double?
  var fxDated: String?
  var patientId: String?
  var contactId: String?
  var contactLabel: String?
  var description: String?
}

struct TransactionUpdate: Encodable {
  var kind: TransactionKind?
  var title: String?
  var subtitle: String?
  var category: String?
  var occurredOn: String?
  var status: TransactionStatus?
  var invoiceStatus: InvoiceStatus?
  var paymentMethod: String?
  var amount: Int?
  var paidAmount: Int?
  var currency: SupportedCurrency?
  var amountBase: Int?
  var baseCurrency: SupportedCurrency?
  var fxRate: Double?
  var fxDated: String?
  var patientId: String?
  var contactId: String?
  var contactLabel: String?
  var description: String?
}

// MARK: - Reports

struct ReportPeriod: Decodable {
  let from: String?
  let to: String?
  let effectiveFrom: String?
  let effectiveTo: String?
}

struct ReportSummary: Decodable {
  let period: ReportPeriod
  let incomeBase: Int
  let expenseBase: Int
  let netBase: Int
  let transactionCount: Int
}

struct ReportCategoryRow: Decodable, Identifiable {
  let categoryName: String
  let incomeBase: Int
  let expenseBase: Int
  let netBase: Int
  let transactionCount: Int
  var id: String { categoryName }
}

struct ReportByCategory: Decodable {
  let period: ReportPeriod
  let items: [ReportCategoryRow]
}

struct ReportMonthRow: Decodable, Identifiable {
  let month: String                  // YYYY-MM
  let incomeBase: Int
  let expenseBase: Int
  let netBase: Int
  let transactionCount: Int
  var id: String { month }
}

struct ReportMonthly: Decodable {
  let period: ReportPeriod
  let items: [ReportMonthRow]
}

// MARK: - Marketing report (Gerçek ROAS)

struct MarketingSourceRow: Decodable, Identifiable {
  let source: String
  let leads: Int
  let treated: Int
  let revenueBase: Int
  var id: String { source }
}

struct MarketingReport: Decodable {
  let period: ReportPeriod
  let spendBase: Int?
  let revenueBase: Int
  let realRoas: Double?
  let leadsCount: Int
  let treatedCount: Int
  let costPerLead: Int?
  let costPerTreated: Int?
  let spendFxMissing: Bool
  let attributionMissing: Bool
  let bySource: [MarketingSourceRow]
}

// MARK: - Me / session

struct MeResponse: Decodable {
  struct User: Decodable {
    let id: String
    let email: String
    let name: String?
    let twoFactorEnabled: Bool
  }
  struct Session: Decodable {
    let activeOrganizationId: String?
  }
  let user: User
  let session: Session
}
