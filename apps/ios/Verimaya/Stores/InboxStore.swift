import Foundation
import Observation

/*
 "AI ile İşlem" ekranının veri deposu.

 ARŞİV DERSİ #5: `GET /v1/whatsapp/inbox` zarfı `items` DEĞİL, **`messages`**.
 `InboxEnvelope` bu yüzden ayrı bir tip.

 AGENTS.md ilke 6: AI çıkarımı taslaktır. Bu ekran taslak üretir ve gösterir;
 onaylama (`approve-drafts`) her taslak için kur, ödeme durumu, ödenen tutar ve
 karşı taraf ister — o form bu turun kapsamında değil, bu yüzden onay düğmesi
 KONMADI (ölü düğme yerine yokluk).
*/
@Observable
@MainActor
final class InboxStore: LoadableStore {
    var messages: [InboundMessage] = []
    var drafts: [TransactionDraft] = []
    var activeMessageId: String?

    var isLoading = false
    var isParsing = false
    var isProcessing = false
    var errorMessage: String?
    var parseError: String?
    var hasLoadedOnce = false

    private let client: APIClient

    init(client: APIClient = .shared) {
        self.client = client
    }

    /// Kuyrukta bekleyenler (web ile aynı süzgeç: `new` + `parsed`).
    var pending: [InboundMessage] {
        messages.filter { $0.status == .new || $0.status == .parsed }
    }

    /// Finans başlığındaki rozet — yalnız `new` sayılır.
    var newCount: Int {
        messages.filter { $0.status == .new }.count
    }

    func reload() async {
        await run {
            messages = try await client.listInbox()
            hasLoadedOnce = true
        }
    }

    /// Yapıştırılan serbest metni ayrıştırır. Kalıcı kayıt YAZMAZ.
    func analyze(text: String) async {
        let trimmed = text.trimmed
        guard !trimmed.isEmpty else { return }
        isParsing = true
        parseError = nil
        activeMessageId = nil
        defer { isParsing = false }
        do {
            let response = try await client.parseMessage(trimmed)
            drafts = response.records
            if response.records.isEmpty { parseError = S.Finance.AI.parseNone }
        } catch {
            drafts = []
            parseError = APIError.message(from: error)
        }
    }

    /// Kuyruktaki bir mesajı ayrıştırır.
    func analyze(message: InboundMessage) async {
        isParsing = true
        parseError = nil
        activeMessageId = message.id
        defer { isParsing = false }
        do {
            let response = try await client.parseInboxItem(message.id)
            drafts = response.records
            if response.records.isEmpty {
                parseError = message.hasMedia
                    ? "Mesajda yalnız medya var; metin çıkarılamadı."
                    : S.Finance.AI.parseNone
            }
            await refreshQuietly()
        } catch {
            drafts = []
            parseError = APIError.message(from: error)
        }
    }

    /// Gövdesi olan tüm `new` mesajları sunucuda ayrıştırır.
    func processNew() async {
        isProcessing = true
        defer { isProcessing = false }
        do {
            _ = try await client.processInbox()
            await refreshQuietly()
        } catch {
            errorMessage = APIError.message(from: error)
        }
    }

    func ignore(_ message: InboundMessage) async {
        do {
            _ = try await client.ignoreInboxItem(message.id)
            if activeMessageId == message.id {
                activeMessageId = nil
                drafts = []
            }
            await refreshQuietly()
        } catch {
            errorMessage = APIError.message(from: error)
        }
    }

    /// Yükleniyor göstergesi yakmadan listeyi tazeler (eylem sonrası).
    private func refreshQuietly() async {
        if let refreshed = try? await client.listInbox() {
            messages = refreshed
        }
    }
}
