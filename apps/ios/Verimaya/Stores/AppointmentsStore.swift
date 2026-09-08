import Foundation
import Observation

/*
 Randevular ekranının veri deposu.

 DİKKAT — randevu listesinin zarfı `total_count` TAŞIMAZ; `status_counts` ve
 `type_counts` döner. Sayaç `status_counts` toplamıdır (web `+page.svelte` da
 aynısını yapıyor: `Object.values(counts).reduce(...)`). Yine "yüklü satırları
 say" değil, sunucunun verdiği sayı.

 Süzgeçler sunucuda: `appointment_type`, `status`, `from`, `to`.
*/
@Observable
@MainActor
final class AppointmentsStore: LoadableStore {
    var items: [Appointment] = []
    /// `status_counts` toplamı — süzülmüş kümenin sunucudaki gerçek boyu.
    var totalCount: Int?
    var appointmentTypes: [String] = []

    var isLoading = false
    var isLoadingMore = false
    var errorMessage: String?
    var hasLoadedOnce = false

    private var nextCursor: String?
    private let client: APIClient

    init(client: APIClient = .shared) {
        self.client = client
    }

    var canLoadMore: Bool { nextCursor != nil }

    struct Filters: Equatable {
        var type: String?
        var status: String?
        var from: String?
        var to: String?

        var key: String {
            [type, status, from, to].map { $0 ?? "-" }.joined(separator: "|")
        }
    }

    func loadTypesIfNeeded() async {
        guard appointmentTypes.isEmpty else { return }
        let rows = (try? await client.listAppointmentTypes()) ?? []
        appointmentTypes = rows.map(\.name)
    }

    func reload(_ filters: Filters) async {
        await run {
            let page = try await client.listAppointments(
                cursor: nil,
                from: filters.from,
                to: filters.to,
                status: filters.status,
                appointmentType: filters.type
            )
            items = page.items
            totalCount = page.totalCount
            nextCursor = page.nextCursor
            hasLoadedOnce = true
        }
    }

    func loadMore(_ filters: Filters) async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await client.listAppointments(
                cursor: cursor,
                from: filters.from,
                to: filters.to,
                status: filters.status,
                appointmentType: filters.type
            )
            items.append(contentsOf: page.items)
            nextCursor = page.nextCursor
            totalCount = page.totalCount ?? totalCount
        } catch {
            errorMessage = APIError.message(from: error)
        }
    }

    // MARK: Yazma

    func create(_ body: AppointmentWrite) async throws {
        _ = try await client.createAppointment(body)
    }

    func update(_ id: String, _ body: AppointmentWrite) async throws {
        _ = try await client.updateAppointment(id, body)
    }

    func delete(_ id: String) async throws {
        try await client.deleteAppointment(id)
    }
}
