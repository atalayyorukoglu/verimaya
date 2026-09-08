import Foundation

@MainActor
final class AppointmentsViewModel: ObservableObject {
  @Published var appointments: [Appointment] = []
  @Published var isLoading = false
  @Published var statusMessage: String?
  @Published var nextCursor: String?
  @Published var hasMore = false

  /// Sunucuya gönderilen süzgeçler.
  @Published var search = ""
  @Published var status = ""
  @Published var appointmentType = ""
  @Published var from: String?
  @Published var to: String?
  /// Tür seçicisinde gösterilecek adlar — süzgeç sunucuda, liste boşalınca
  /// seçenekler kaybolmasın diye görülenler biriktirilir.
  @Published var knownTypes: [String] = []

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
      let page = try await api.listAppointments(
        cursor: reset ? nil : nextCursor, q: search,
        from: from, to: to, status: status, appointmentType: appointmentType
      )
      if reset {
        appointments = page.items
      } else {
        appointments.append(contentsOf: page.items)
      }
      nextCursor = page.nextCursor
      hasMore = page.nextCursor != nil
      rememberTypes()
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
    }
  }

  func loadMore() async {
    guard hasMore, !isLoading, !isLoadingMore, nextCursor != nil else { return }
    isLoadingMore = true
    defer { isLoadingMore = false }
    do {
      let page = try await api.listAppointments(
        cursor: nextCursor, q: search, from: from, to: to,
        status: status, appointmentType: appointmentType
      )
      appointments.append(contentsOf: page.items)
      nextCursor = page.nextCursor
      hasMore = page.nextCursor != nil
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
    }
  }

  private func rememberTypes() {
    for name in appointments.compactMap(\.appointmentType) where !knownTypes.contains(name) {
      knownTypes.append(name)
    }
  }

  func refresh() async {
    await load(reset: true)
  }

  @discardableResult
  func create(_ body: AppointmentCreate) async -> Bool {
    statusMessage = nil
    do {
      let created = try await api.createAppointment(body)
      appointments.insert(created, at: 0)
      return true
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
      return false
    }
  }

  @discardableResult
  func update(id: String, _ body: AppointmentUpdate) async -> Bool {
    statusMessage = nil
    do {
      let updated = try await api.updateAppointment(id, body)
      if let idx = appointments.firstIndex(where: { $0.id == id }) {
        appointments[idx] = updated
      }
      return true
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
      return false
    }
  }

  @discardableResult
  func cancel(id: String) async -> Bool {
    await update(id: id, AppointmentUpdate(status: .cancelled))
  }
}
