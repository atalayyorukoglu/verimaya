import Foundation
import Observation

/*
 Kişiler ekranının veri deposu.

 ARŞİV DERSİ #1: `count` sunucudan gelen `total_count`'tur — `items.count` DEĞİL.
 Panel "51 kişi" derken uygulamanın "1 kişi" demesinin sebebi tam olarak buydu.

 ARŞİV DERSİ #2: tür süzgeci ve arama sunucuya `type_id` / `q` olarak gider;
 yüklü sayfa istemcide süzülmez.
*/
@Observable
@MainActor
final class ContactsStore: LoadableStore {
    var items: [Contact] = []
    /// Sunucudan gelen toplam — ekrandaki sayaç bunu gösterir.
    var totalCount: Int?
    var contactTypes: [ContactType] = []

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

    /// Sözlük bir kez yüklenir; süzgeç seçenekleri buradan gelir.
    func loadTypesIfNeeded() async {
        guard contactTypes.isEmpty else { return }
        contactTypes = (try? await client.listContactTypes()) ?? []
    }

    /// Web'in varsayılanı: "Hasta" tipi seçili açılır (`defaultTypeApplied`).
    /// Tip kimliği kiracıya özeldir, bu yüzden ADA göre bulunur — sabit UUID yok.
    var defaultTypeId: String? {
        contactTypes.first { $0.name == "Hasta" }?.id
    }

    func reload(typeId: String?, query: String?) async {
        await run {
            let page = try await client.listContacts(
                cursor: nil,
                q: query,
                typeId: typeId
            )
            items = page.items
            totalCount = page.totalCount
            nextCursor = page.nextCursor
            hasLoadedOnce = true
        }
    }

    func loadMore(typeId: String?, query: String?) async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await client.listContacts(cursor: cursor, q: query, typeId: typeId)
            items.append(contentsOf: page.items)
            nextCursor = page.nextCursor
            // `total_count` her sayfada aynı gelir; yine de tazeliyoruz.
            totalCount = page.totalCount ?? totalCount
        } catch {
            errorMessage = APIError.message(from: error)
        }
    }

    // MARK: Yazma

    func create(_ body: ContactCreate) async throws {
        _ = try await client.createContact(body)
    }

    func update(_ id: String, _ body: ContactUpdate) async throws {
        _ = try await client.updateContact(id, body)
    }

    func delete(_ id: String) async throws {
        try await client.deleteContact(id)
    }
}
