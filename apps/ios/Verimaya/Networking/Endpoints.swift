import Foundation

/*
 Tipli uç yüzeyi. Ekranlar bunları çağırır; taşıma katmanı `APIClient`'ta.

 ARŞİV DERSİ #2 — SÜZGEÇLER SUNUCUDA UYGULANIR.
 `packages/shared/src/list-query.ts` şemaları `.strict()`:
   • bilinmeyen parametre → 400 `Unrecognized key(s) in object`
   • boş değer (`?q=`) → 400 `String must contain at least 1 character(s)`
 İkisini de canlı API'ye karşı doğruladım. Bu yüzden sorgu parametreleri TEK
 yerden, `appendIfPresent` ile eklenir: boş/boşluk olan değer hiç yazılmaz.
 Yüklü sayfayı istemcide süzmek de yanlıştır — kalan sayfalar görünmez.
*/
extension APIClient {

    // MARK: Oturum sahibi / kiracı

    func me() async throws -> Me {
        try await get("me")
    }

    func currentTenant() async throws -> Tenant {
        try await get("tenants/current")
    }

    func listMyOrganizations() async throws -> [MeOrganization] {
        let page: ItemsEnvelope<MeOrganization> = try await get("me/organizations")
        return page.items
    }

    // MARK: Kişiler

    func listContacts(
        cursor: String? = nil,
        limit: Int = AppConfig.pageSize,
        q: String? = nil,
        typeId: String? = nil
    ) async throws -> CursorPage<Contact> {
        var query = Self.pageQuery(cursor: cursor, limit: limit)
        Self.appendIfPresent(&query, "q", q)
        Self.appendIfPresent(&query, "type_id", typeId)
        return try await get("contacts", query: query)
    }

    func createContact(_ body: ContactCreate) async throws -> Contact {
        try await post("contacts", body: body)
    }

    func updateContact(_ id: String, _ body: ContactUpdate) async throws -> Contact {
        try await patch("contacts/\(id)", body: body)
    }

    func deleteContact(_ id: String) async throws {
        try await delete("contacts/\(id)")
    }

    func listContactTypes() async throws -> [ContactType] {
        let page: ItemsEnvelope<ContactType> = try await get("settings/contact-types")
        return page.items.sorted { ($0.sortOrder ?? 0) < ($1.sortOrder ?? 0) }
    }

    // MARK: Randevular

    /// `from`/`to` kiracının takvim günleridir (dahil); sunucu UTC sınırlarına çevirir.
    func listAppointments(
        cursor: String? = nil,
        limit: Int = AppConfig.pageSize,
        from: String? = nil,
        to: String? = nil,
        status: String? = nil,
        appointmentType: String? = nil,
        contactId: String? = nil
    ) async throws -> AppointmentPage {
        var query = Self.pageQuery(cursor: cursor, limit: limit)
        Self.appendIfPresent(&query, "from", from)
        Self.appendIfPresent(&query, "to", to)
        Self.appendIfPresent(&query, "status", status)
        Self.appendIfPresent(&query, "appointment_type", appointmentType)
        Self.appendIfPresent(&query, "contact_id", contactId)
        return try await get("appointments", query: query)
    }

    func createAppointment(_ body: AppointmentWrite) async throws -> Appointment {
        try await post("appointments", body: body)
    }

    func updateAppointment(_ id: String, _ body: AppointmentWrite) async throws -> Appointment {
        try await patch("appointments/\(id)", body: body)
    }

    func deleteAppointment(_ id: String) async throws {
        try await delete("appointments/\(id)")
    }

    func listAppointmentTypes() async throws -> [AppointmentTypeSetting] {
        let page: ItemsEnvelope<AppointmentTypeSetting> = try await get("settings/appointment-types")
        return page.items.sorted { ($0.sortOrder ?? 0) < ($1.sortOrder ?? 0) }
    }

    // MARK: İşlemler

    /// `from`/`to` `occurred_on` sütununu süzer (takvim günü, dahil).
    func listTransactions(
        cursor: String? = nil,
        limit: Int = AppConfig.pageSize,
        q: String? = nil,
        from: String? = nil,
        to: String? = nil,
        kind: String? = nil,
        status: String? = nil
    ) async throws -> CursorPage<Transaction> {
        var query = Self.pageQuery(cursor: cursor, limit: limit)
        Self.appendIfPresent(&query, "q", q)
        Self.appendIfPresent(&query, "from", from)
        Self.appendIfPresent(&query, "to", to)
        Self.appendIfPresent(&query, "kind", kind)
        Self.appendIfPresent(&query, "status", status)
        return try await get("transactions", query: query)
    }

    func createTransaction(_ body: TransactionWrite) async throws -> Transaction {
        try await post("transactions", body: body)
    }

    func updateTransaction(_ id: String, _ body: TransactionWrite) async throws -> Transaction {
        try await patch("transactions/\(id)", body: body)
    }

    func deleteTransaction(_ id: String) async throws {
        try await delete("transactions/\(id)")
    }

    // MARK: Raporlar

    func reportBalances() async throws -> [Balance] {
        let page: ItemsEnvelope<Balance> = try await get("reports/balances")
        return page.items
    }

    func reportSummary(from: String?, to: String?) async throws -> ReportSummary {
        try await get("reports/summary", query: Self.periodQuery(from: from, to: to))
    }

    func reportAppointmentMetrics(from: String?, to: String?) async throws -> ReportAppointmentMetrics {
        try await get("reports/appointment-metrics", query: Self.periodQuery(from: from, to: to))
    }

    func reportByCategory(from: String?, to: String?) async throws -> ReportByCategory {
        try await get("reports/by-category", query: Self.periodQuery(from: from, to: to))
    }

    func reportMonthly(from: String?, to: String?) async throws -> ReportMonthly {
        try await get("reports/monthly", query: Self.periodQuery(from: from, to: to))
    }

    func reportContactDistribution(from: String?, to: String?) async throws -> ReportContactDistribution {
        try await get("reports/contact-distribution", query: Self.periodQuery(from: from, to: to))
    }

    func reportConsistency(from: String?, to: String?) async throws -> ReportConsistency {
        try await get("reports/consistency", query: Self.periodQuery(from: from, to: to))
    }

    func reportMarketing(from: String?, to: String?) async throws -> MarketingReport {
        try await get("reports/marketing", query: Self.periodQuery(from: from, to: to))
    }

    // MARK: WhatsApp gelen kutusu (AI ile işlem)

    /// Arşiv dersi #5: zarf `items` değil `messages`.
    func listInbox() async throws -> [InboundMessage] {
        let envelope: InboxEnvelope = try await get("whatsapp/inbox")
        return envelope.messages
    }

    /// Serbest metni ayrıştırır — kalıcı kayıt yazmaz, yalnız taslak önerir.
    func parseMessage(_ message: String) async throws -> InboxParseResponse {
        try await post("whatsapp/parse",
                       body: ["message": message],
                       idempotencyKey: nil)
    }

    /// Gövdesi olan tüm `new` mesajları ayrıştırır. İşlem oluşturmaz.
    func processInbox() async throws -> EmptyResponse {
        try await post("whatsapp/inbox/process", body: EmptyBody(), idempotencyKey: nil)
    }

    func parseInboxItem(_ id: String) async throws -> InboxParseResponse {
        try await post("whatsapp/inbox/\(id)/parse", body: EmptyBody(), idempotencyKey: nil)
    }

    func ignoreInboxItem(_ id: String) async throws -> EmptyResponse {
        try await post("whatsapp/inbox/\(id)/ignore", body: EmptyBody(), idempotencyKey: nil)
    }

    // MARK: Sorgu yardımcıları

    /*
     Boş değer sorgu dizesine YAZILMAZ. `.strict()` şema boş dizeyi de bilinmeyen
     anahtarı da 400 ile reddediyor; bu tek nokta iki hatayı da baştan keser.
    */
    static func appendIfPresent(_ query: inout [URLQueryItem], _ name: String, _ value: String?) {
        guard let value else { return }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        query.append(URLQueryItem(name: name, value: trimmed))
    }

    static func pageQuery(cursor: String?, limit: Int) -> [URLQueryItem] {
        var query = [URLQueryItem(name: "limit", value: String(limit))]
        appendIfPresent(&query, "cursor", cursor)
        return query
    }

    static func periodQuery(from: String?, to: String?) -> [URLQueryItem] {
        var query: [URLQueryItem] = []
        appendIfPresent(&query, "from", from)
        appendIfPresent(&query, "to", to)
        return query
    }
}
