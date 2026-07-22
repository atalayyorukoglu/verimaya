import Foundation

@MainActor
final class PatientsViewModel: ObservableObject {
  @Published var patients: [Patient] = []
  @Published var isLoading = false
  @Published var statusMessage: String?
  @Published var nextCursor: String?
  @Published var hasMore = false

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
      let page = try await api.listPatients(cursor: reset ? nil : nextCursor)
      if reset {
        patients = page.items
      } else {
        patients.append(contentsOf: page.items)
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
      let page = try await api.listPatients(cursor: nextCursor)
      patients.append(contentsOf: page.items)
      nextCursor = page.nextCursor
      hasMore = page.nextCursor != nil
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
    }
  }

  func refresh() async {
    await load(reset: true)
  }

  @discardableResult
  func create(_ body: PatientCreate) async -> Bool {
    statusMessage = nil
    do {
      let created = try await api.createPatient(body)
      patients.insert(created, at: 0)
      return true
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
      return false
    }
  }

  @discardableResult
  func update(id: String, _ body: PatientUpdate) async -> Bool {
    statusMessage = nil
    do {
      let updated = try await api.updatePatient(id, body)
      if let idx = patients.firstIndex(where: { $0.id == id }) {
        patients[idx] = updated
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
      try await api.deletePatient(id)
      patients.removeAll { $0.id == id }
      return true
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
      return false
    }
  }
}
