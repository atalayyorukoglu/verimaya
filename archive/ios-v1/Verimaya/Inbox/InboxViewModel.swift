import Foundation

/// WhatsApp gelen kutusu — "AI işlem" sekmesinin beyni.
///
/// Akış web paneliyle aynı: mesajları listele → ayrıştır → taslakları onayla.
/// Onay para yolu (MONEY-01): işlem kaydı yalnız kullanıcı onaylayınca yazılır.
@MainActor
final class InboxViewModel: ObservableObject {
  @Published var messages: [InboundMessage] = []
  @Published var isLoading = false
  @Published var isProcessing = false
  @Published var isParsing = false
  @Published var statusMessage: String?
  @Published var nextCursor: String?
  @Published var hasMore = false

  /// Ayrıştırması açık olan mesaj ve taslakları (onay sayfası bunlara bakar).
  @Published var activeMessage: InboundMessage?
  @Published var drafts: [TransactionDraft] = []

  private let api = APIClient.shared
  private var isLoadingMore = false

  /// Onay bekleyenler — `approved` / `ignored` listede durmaz (web ile aynı süzgeç).
  var pending: [InboundMessage] {
    messages.filter { $0.status == .new || $0.status == .parsed }
  }

  /// Web'deki sayaç yalnız **yeni** mesajları sayar.
  var pendingCount: Int {
    messages.filter { $0.status == .new }.count
  }

  func load(reset: Bool) async {
    if reset {
      nextCursor = nil
      hasMore = false
    }
    isLoading = true
    statusMessage = nil
    defer { isLoading = false }
    do {
      let page = try await api.listInbox(cursor: reset ? nil : nextCursor)
      if reset {
        messages = page.messages
      } else {
        messages.append(contentsOf: page.messages)
      }
      nextCursor = page.nextCursor
      hasMore = page.nextCursor != nil
    } catch {
      statusMessage = Self.describe(error)
    }
  }

  func loadMore() async {
    guard hasMore, !isLoading, !isLoadingMore, nextCursor != nil else { return }
    isLoadingMore = true
    defer { isLoadingMore = false }
    do {
      let page = try await api.listInbox(cursor: nextCursor)
      messages.append(contentsOf: page.messages)
      nextCursor = page.nextCursor
      hasMore = page.nextCursor != nil
    } catch {
      statusMessage = Self.describe(error)
    }
  }

  func refresh() async { await load(reset: true) }

  /// Gövdesi olan tüm yeni mesajları ayrıştırır. İşlem oluşturmaz.
  func processNew() async {
    isProcessing = true
    statusMessage = nil
    defer { isProcessing = false }
    do {
      let result = try await api.processInbox()
      statusMessage = "\(result.processed) mesaj işlendi · \(result.parsed) ayrıştırıldı · \(result.error) hata"
      await load(reset: true)
    } catch {
      statusMessage = Self.describe(error)
    }
  }

  /// Tek mesajı ayrıştırıp onay sayfasını açar.
  func analyze(_ message: InboundMessage) async {
    isParsing = true
    statusMessage = nil
    defer { isParsing = false }
    do {
      let result = try await api.parseInboxItem(message.id)
      drafts = result.records
      activeMessage = message
      if result.records.isEmpty {
        statusMessage = "Bu mesajdan işlem çıkarılamadı."
        activeMessage = nil
      }
      await load(reset: true)
    } catch {
      statusMessage = Self.describe(error)
    }
  }

  /// Panele yapıştırılan serbest metni ayrıştırır (kayıt oluşturmaz).
  /// Kaynak mesaj olmadığı için onay akışı açılmaz — sonuç bilgilendirmedir.
  func analyzePasted(_ message: String) async {
    let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return }
    isParsing = true
    statusMessage = nil
    defer { isParsing = false }
    do {
      let result = try await api.parseMessage(text)
      statusMessage = result.records.isEmpty
        ? "Bu metinden işlem çıkarılamadı."
        : "\(result.records.count) taslak çıkarıldı. Kayıt için kuyruktaki mesajı onayla."
    } catch {
      statusMessage = Self.describe(error)
    }
  }

  func ignore(_ id: String) async {
    statusMessage = nil
    do {
      _ = try await api.ignoreInboxItem(id)
      messages.removeAll { $0.id == id }
    } catch {
      statusMessage = Self.describe(error)
    }
  }

  /// Taslakları onaylar ve işlemleri yazar. Sunucu aynı mesajı ikinci kez
  /// onaylamayı 409 ile reddeder — mesajı kullanıcıya olduğu gibi gösteriyoruz.
  @discardableResult
  func approve(_ items: [ApproveDraftItem]) async -> Bool {
    guard let message = activeMessage else { return false }
    statusMessage = nil
    do {
      let result = try await api.approveDrafts(message.id, ApproveDraftsRequest(drafts: items))
      statusMessage = "\(result.transactions.count) işlem kaydedildi."
      activeMessage = nil
      drafts = []
      await load(reset: true)
      return true
    } catch {
      statusMessage = Self.describe(error)
      return false
    }
  }

  func closeDrafts() {
    activeMessage = nil
    drafts = []
  }

  /// Aynı olayı anlatan diğer mesajlar (AI-13). Sunucu `group_id` ile işaretler.
  func groupSiblings(of message: InboundMessage) -> [InboundMessage] {
    guard let groupId = message.groupId else { return [] }
    return messages.filter { $0.groupId == groupId && $0.id != message.id }
  }

  private static func describe(_ error: Error) -> String {
    (error as? APIError)?.errorDescription ?? error.localizedDescription
  }
}
