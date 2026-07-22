import Foundation

@MainActor
final class TransactionsViewModel: ObservableObject {
  @Published var transactions: [Transaction] = []
  @Published var isLoading = false
  @Published var statusMessage: String?
  @Published var nextCursor: String?
  @Published var hasMore = false
  @Published var totalIncomeMinor = 0
  @Published var totalExpenseMinor = 0

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
      let page = try await api.listTransactions(cursor: reset ? nil : nextCursor)
      if reset {
        transactions = page.items
      } else {
        transactions.append(contentsOf: page.items)
      }
      nextCursor = page.nextCursor
      hasMore = page.nextCursor != nil
      recomputeTotals()
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
    }
  }

  func loadMore() async {
    guard hasMore, !isLoading, !isLoadingMore, nextCursor != nil else { return }
    isLoadingMore = true
    defer { isLoadingMore = false }
    do {
      let page = try await api.listTransactions(cursor: nextCursor)
      transactions.append(contentsOf: page.items)
      nextCursor = page.nextCursor
      hasMore = page.nextCursor != nil
      recomputeTotals()
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
    }
  }

  func refresh() async {
    await load(reset: true)
  }

  @discardableResult
  func create(_ body: TransactionCreate) async -> Bool {
    statusMessage = nil
    do {
      let created = try await api.createTransaction(body)
      transactions.insert(created, at: 0)
      recomputeTotals()
      return true
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
      return false
    }
  }

  @discardableResult
  func update(id: String, _ body: TransactionUpdate) async -> Bool {
    statusMessage = nil
    do {
      let updated = try await api.updateTransaction(id, body)
      if let idx = transactions.firstIndex(where: { $0.id == id }) {
        transactions[idx] = updated
      }
      recomputeTotals()
      return true
    } catch {
      statusMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
      return false
    }
  }

  private func recomputeTotals() {
    var income = 0
    var expense = 0
    for tx in transactions {
      let minor = tx.amountBase ?? tx.amount
      switch tx.kind {
      case .income: income += minor
      case .expense: expense += minor
      }
    }
    totalIncomeMinor = income
    totalExpenseMinor = expense
  }
}
