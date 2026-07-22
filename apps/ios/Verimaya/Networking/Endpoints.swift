import Foundation

/// Typed endpoint surface. Screens call these; transport lives in APIClient.
extension APIClient {

  // MARK: Patients
  func listPatients(cursor: String? = nil, limit: Int = 25) async throws -> CursorPage<Patient> {
    try await get("patients", query: pageQuery(cursor: cursor, limit: limit))
  }
  func getPatient(_ id: String) async throws -> Patient { try await get("patients/\(id)") }
  func createPatient(_ body: PatientCreate) async throws -> Patient { try await post("patients", body: body) }
  func updatePatient(_ id: String, _ body: PatientUpdate) async throws -> Patient {
    try await patch("patients/\(id)", body: body)
  }
  func deletePatient(_ id: String) async throws { try await delete("patients/\(id)") }
  func patientFinanceSummary(_ id: String) async throws -> PatientFinanceSummary {
    try await get("patients/\(id)/finance-summary")
  }

  // MARK: Appointments
  func listAppointments(cursor: String? = nil, limit: Int = 25) async throws -> CursorPage<Appointment> {
    try await get("appointments", query: pageQuery(cursor: cursor, limit: limit))
  }
  func createAppointment(_ body: AppointmentCreate) async throws -> Appointment {
    try await post("appointments", body: body)
  }
  func updateAppointment(_ id: String, _ body: AppointmentUpdate) async throws -> Appointment {
    try await patch("appointments/\(id)", body: body)
  }

  // MARK: Transactions
  func listTransactions(cursor: String? = nil, limit: Int = 25) async throws -> CursorPage<Transaction> {
    try await get("transactions", query: pageQuery(cursor: cursor, limit: limit))
  }
  func createTransaction(_ body: TransactionCreate) async throws -> Transaction {
    try await post("transactions", body: body)
  }
  func updateTransaction(_ id: String, _ body: TransactionUpdate) async throws -> Transaction {
    try await patch("transactions/\(id)", body: body)
  }

  // MARK: Reports
  func reportSummary(from: String? = nil, to: String? = nil) async throws -> ReportSummary {
    try await get("reports/summary", query: periodQuery(from: from, to: to))
  }
  func reportByCategory(from: String? = nil, to: String? = nil) async throws -> ReportByCategory {
    try await get("reports/by-category", query: periodQuery(from: from, to: to))
  }
  func reportMonthly(from: String? = nil, to: String? = nil) async throws -> ReportMonthly {
    try await get("reports/monthly", query: periodQuery(from: from, to: to))
  }
  func reportMarketing(from: String? = nil, to: String? = nil, provider: String? = nil) async throws -> MarketingReport {
    var q = periodQuery(from: from, to: to)
    if let provider { q.append(URLQueryItem(name: "provider", value: provider)) }
    return try await get("reports/marketing", query: q)
  }

  // MARK: Me
  func me() async throws -> MeResponse { try await get("me") }

  // MARK: Query helpers
  private func pageQuery(cursor: String?, limit: Int) -> [URLQueryItem] {
    var q = [URLQueryItem(name: "limit", value: String(limit))]
    if let cursor { q.append(URLQueryItem(name: "cursor", value: cursor)) }
    return q
  }
  private func periodQuery(from: String?, to: String?) -> [URLQueryItem] {
    var q: [URLQueryItem] = []
    if let from { q.append(URLQueryItem(name: "from", value: from)) }
    if let to { q.append(URLQueryItem(name: "to", value: to)) }
    return q
  }
}
