import Foundation

@MainActor
final class AppointmentsViewModel: ObservableObject {
  @Published var appointments: [Appointment] = []
  @Published var isLoading = false
  @Published var statusMessage: String?
  @Published var nextCursor: String?
  @Published var hasMore = false

  /// Web'de başlığın sağında duran "2026-09-01 > 2026-09-30" aralığı.
  var rangeLabel: String {
    let cal = Calendar.current
    let now = Date()
    guard let interval = cal.dateInterval(of: .month, for: now) else { return "" }
    let fmt = DateFormatter()
    fmt.locale = Locale(identifier: "tr_TR")
    fmt.dateFormat = "yyyy-MM-dd"
    let last = cal.date(byAdding: .day, value: -1, to: interval.end) ?? interval.end
    return "\(fmt.string(from: interval.start)) > \(fmt.string(from: last))"
  }

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
      let page = try await api.listAppointments(cursor: reset ? nil : nextCursor)
      if reset {
        appointments = page.items
      } else {
        appointments.append(contentsOf: page.items)
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
      let page = try await api.listAppointments(cursor: nextCursor)
      appointments.append(contentsOf: page.items)
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
