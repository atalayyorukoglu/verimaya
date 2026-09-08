import Foundation
import Observation

/*
 Finans ekranının veri deposu.

 Sayaç `total_count`'tan; tür/durum/arama/dönem süzgeçleri SUNUCUDA
 (`kind`, `status`, `q`, `from`, `to` — hepsi `transactionListQuerySchema`
 içinde tanımlı). Kabuk başlığındaki dönem denetimi `from`/`to`'ya çevrilir.
*/
@Observable
@MainActor
final class TransactionsStore: LoadableStore {
    var items: [Transaction] = []
    var totalCount: Int?
    var balances: [Balance] = []

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
        var query: String?
        var kind: String?
        var status: String?
        var from: String?
        var to: String?

        /// `.task(id:)` anahtarı.
        var key: String {
            [query, kind, status, from, to].map { $0 ?? "-" }.joined(separator: "|")
        }

        var isActive: Bool {
            [query, kind, status, from, to].contains { ($0?.trimmed.isEmpty == false) }
        }
    }

    func reload(_ filters: Filters) async {
        await run {
            let page = try await client.listTransactions(
                cursor: nil,
                q: filters.query,
                from: filters.from,
                to: filters.to,
                kind: filters.kind,
                status: filters.status
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
            let page = try await client.listTransactions(
                cursor: cursor,
                q: filters.query,
                from: filters.from,
                to: filters.to,
                kind: filters.kind,
                status: filters.status
            )
            items.append(contentsOf: page.items)
            nextCursor = page.nextCursor
            totalCount = page.totalCount ?? totalCount
        } catch {
            errorMessage = APIError.message(from: error)
        }
    }

    /// Bakiye şeridi — dönemden bağımsız (açık bakiye anlık durumdur).
    func loadBalances() async {
        balances = (try? await client.reportBalances()) ?? []
    }

    // MARK: Yazma

    func create(_ body: TransactionWrite) async throws {
        _ = try await client.createTransaction(body)
    }

    func update(_ id: String, _ body: TransactionWrite) async throws {
        _ = try await client.updateTransaction(id, body)
    }

    func delete(_ id: String) async throws {
        try await client.deleteTransaction(id)
    }
}
