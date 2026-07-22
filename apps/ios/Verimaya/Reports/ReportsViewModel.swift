import Foundation

@MainActor
final class ReportsViewModel: ObservableObject {
  @Published var preset: PeriodPreset = .buAy
  @Published var summary: ReportSummary?
  @Published var monthly: ReportMonthly?
  @Published var byCategory: ReportByCategory?
  @Published var marketing: MarketingReport?
  @Published var isLoading = false
  @Published var statusMessage: String?

  private let api = APIClient.shared

  func setPreset(_ preset: PeriodPreset) async {
    self.preset = preset
    await load()
  }

  func load() async {
    isLoading = true
    statusMessage = nil
    defer { isLoading = false }

    let range = preset.range
    let from = range.from
    let to = range.to

    async let summaryRes = fetch { try await api.reportSummary(from: from, to: to) }
    async let monthlyRes = fetch { try await api.reportMonthly(from: from, to: to) }
    async let categoryRes = fetch { try await api.reportByCategory(from: from, to: to) }
    async let marketingRes = fetch { try await api.reportMarketing(from: from, to: to) }

    let results = await (summaryRes, monthlyRes, categoryRes, marketingRes)

    summary = results.0.value
    monthly = results.1.value
    byCategory = results.2.value
    marketing = results.3.value

    let errors = [results.0.error, results.1.error, results.2.error, results.3.error].compactMap { $0 }
    if let first = errors.first {
      statusMessage = (first as? APIError)?.errorDescription ?? first.localizedDescription
    }
  }

  private func fetch<T>(_ work: () async throws -> T) async -> FetchResult<T> {
    do {
      return FetchResult(value: try await work(), error: nil)
    } catch {
      return FetchResult(value: nil, error: error)
    }
  }
}

private struct FetchResult<T> {
  let value: T?
  let error: Error?
}
