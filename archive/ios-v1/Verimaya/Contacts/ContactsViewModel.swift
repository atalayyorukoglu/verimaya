import Foundation

@MainActor
final class ContactsViewModel: ObservableObject {
  @Published var contacts: [Contact] = []
  @Published var isLoading = false
  @Published var statusMessage: String?
  @Published var nextCursor: String?
  @Published var hasMore = false
  /// Kişi tipi sözlüğü (Hasta, Klinik, …). Yeni kişide zorunlu alan olduğu için
  /// form açılmadan yüklenir.
  @Published var contactTypes: [ContactType] = []

  /// Sunucuya gönderilen süzgeçler (istemcide süzmüyoruz).
  @Published var search = ""
  @Published var typeId = ""

  private let api = APIClient.shared
  private var isLoadingMore = false

  func load(reset: Bool) async {
    if reset {
      nextCursor = nil
      hasMore = false
    }
    isLoading = true
    statusMessage = nil
    defer { isLoading = false }
    do {
      let page = try await api.listContacts(
        cursor: reset ? nil : nextCursor, q: search, typeId: typeId
      )
      if reset {
        contacts = page.items
      } else {
        contacts.append(contentsOf: page.items)
      }
      nextCursor = page.nextCursor
      hasMore = page.nextCursor != nil
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
    }
  }

  func loadMore() async {
    guard hasMore, !isLoading, !isLoadingMore, nextCursor != nil else { return }
    isLoadingMore = true
    defer { isLoadingMore = false }
    do {
      let page = try await api.listContacts(cursor: nextCursor, q: search, typeId: typeId)
      contacts.append(contentsOf: page.items)
      nextCursor = page.nextCursor
      hasMore = page.nextCursor != nil
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
    }
  }

  func refresh() async {
    await load(reset: true)
  }

  func loadContactTypes() async {
    guard contactTypes.isEmpty else { return }
    do {
      contactTypes = try await api.listContactTypes().items
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
    }
  }

  @discardableResult
  func create(_ body: ContactCreate) async -> Bool {
    statusMessage = nil
    do {
      let created = try await api.createContact(body)
      contacts.insert(created, at: 0)
      return true
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
      return false
    }
  }

  @discardableResult
  func update(id: String, _ body: ContactUpdate) async -> Bool {
    statusMessage = nil
    do {
      let updated = try await api.updateContact(id, body)
      if let idx = contacts.firstIndex(where: { $0.id == id }) {
        contacts[idx] = updated
      }
      return true
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
      return false
    }
  }

  @discardableResult
  func delete(id: String) async -> Bool {
    statusMessage = nil
    do {
      try await api.deleteContact(id)
      contacts.removeAll { $0.id == id }
      return true
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
      return false
    }
  }
}
