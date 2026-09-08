import SwiftUI

/*
 `apps/web/src/routes/finance/ai-transaction/+page.svelte` — mobil hâl.

 Web düzeni:
   • `PageHeader`: "AI ile İşlem" + açıklama.
   • "Mesajı yapıştır" kartı: mono yazı tipli çok satırlı alan (`min-h-28`),
     altında "Analiz Et" düğmesi (kıvılcım ikonu). Kuyruktan seçilmişse
     "Onay Kuyruğu'ndan seçildi" notu.
   • "Bekleyenler (n)" kartı: her satırda gönderen (mono, xs), durum rozeti,
     medya/aynı olay rozetleri, sağda zaman (`formatDateTime`), altında mesaj
     önizlemesi (2 satır); sağda "Analiz Et" ve "Yoksay" düğmeleri.
   • Taslaklar bölümü: "Taslaklar (n)" + "Onayla ve kaydet"; en altta not.

 İlke 6: AI çıkarımı TASLAKTIR — onay olmadan kayda geçmez. Mockup'ta da öyle:
 "Onayla ve kaydet" yalnız kuyruktan gelen bir mesaj seçiliyken etkindir.
*/
struct AITransactionView: View {
    @Environment(\.palette) private var c
    @Environment(AppState.self) private var app

    @State private var message = ""
    @State private var messages = MockData.inboundMessages
    @State private var drafts: [TransactionDraft] = []
    @State private var activeInboxId: String?
    @State private var parsing = false
    @State private var parseError: String?
    @State private var approvedNotice: String?

    private var pendingMessages: [InboundMessage] {
        messages.filter { $0.status == .new || $0.status == .parsed }
    }

    private var pendingNewCount: Int {
        messages.filter { $0.status == .new }.count
    }

    private var canApprove: Bool {
        activeInboxId != nil && !drafts.isEmpty
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VMSpace.lg) {
                backButton
                headerBlock
                pasteCard
                pendingCard
                if !drafts.isEmpty { draftsSection }
            }
            .padding(VMSpace.page)
        }
        .background(c.bg)
    }

    private var backButton: some View {
        @Bindable var app = app

        return Button {
            app.financePath.removeLast()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.left")
                    .font(.system(size: 13, weight: .medium))
                Text(S.Finance.title)
                    .font(VMFont.medium(14))
            }
            .foregroundStyle(c.text)
            .padding(.horizontal, 12)
            .frame(height: VMSize.control)
            .vmCard(c, radius: VMRadius.control)
        }
        .buttonStyle(.plain)
    }

    private var headerBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(S.Finance.AI.title)
                .font(VMFont.semibold(16))
                .foregroundStyle(c.text)
            Text(S.Finance.AI.description)
                .font(VMFont.sm)
                .foregroundStyle(c.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var pasteCard: some View {
        VMSection(title: S.Finance.AI.pasteHeading) {
            VStack(alignment: .leading, spacing: VMSpace.md) {
                ZStack(alignment: .topLeading) {
                    if message.isEmpty {
                        Text(S.Finance.AI.pastePlaceholder)
                            .font(.system(size: 14, design: .monospaced))
                            .foregroundStyle(c.textFaint)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                    }
                    TextEditor(text: $message)
                        .font(.system(size: 14, design: .monospaced))
                        .foregroundStyle(c.text)
                        .scrollContentBackground(.hidden)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .frame(minHeight: 112)
                }
                .background(c.surface2)
                .clipShape(RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous)
                        .stroke(c.border, lineWidth: 1)
                )

                if let parseError {
                    Text(parseError)
                        .font(VMFont.sm)
                        .foregroundStyle(c.danger)
                }

                if let approvedNotice {
                    Text(approvedNotice)
                        .font(VMFont.sm)
                        .foregroundStyle(c.success)
                }

                HStack(spacing: VMSpace.sm) {
                    VMButton(title: parsing ? S.Finance.AI.analyzing : S.Finance.AI.analyze,
                             systemImage: "sparkles",
                             disabled: parsing || message.trimmed.isEmpty) {
                        analyzePasted()
                    }
                    if activeInboxId != nil {
                        Text(S.Finance.AI.fromQueue)
                            .font(VMFont.xs)
                            .foregroundStyle(c.textFaint)
                    }
                }
            }
        }
    }

    private var pendingCard: some View {
        VMSection(
            title: pendingNewCount > 0
                ? "\(S.Finance.AI.pendingHeading) (\(pendingNewCount))"
                : S.Finance.AI.pendingHeading,
            trailing: AnyView(
                VMButton(title: S.Finance.AI.pendingProcess, variant: .outline) {
                    // "Yeni mesajları işle": kuyruktaki yeni mesajları ayrıştırılmış yapar.
                    messages = messages.map { item in
                        guard item.status == .new else { return item }
                        return InboundMessage(id: item.id, sender: item.sender, body: item.body,
                                              status: .parsed, hasMedia: item.hasMedia,
                                              createdAt: item.createdAt)
                    }
                }
            )
        ) {
            if pendingMessages.isEmpty {
                Text(S.Finance.AI.pendingEmpty)
                    .font(VMFont.sm)
                    .foregroundStyle(c.textMuted)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(pendingMessages.enumerated()), id: \.element.id) { index, item in
                        if index > 0 {
                            Rectangle().fill(c.border).frame(height: 1)
                        }
                        pendingRow(item)
                    }
                }
            }
        }
    }

    private func pendingRow(_ item: InboundMessage) -> some View {
        VStack(alignment: .leading, spacing: VMSpace.sm) {
            HStack(spacing: 6) {
                Text(item.sender)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(c.textFaint)
                    .lineLimit(1)
                StatusBadge(label: item.status.label,
                            tone: item.status == .new ? .warning : .info)
                if item.hasMedia {
                    StatusBadge(label: S.Finance.AI.pendingMedia, tone: .neutral)
                }
                Spacer(minLength: 0)
                Text(VMFormat.dateTime(item.createdAt))
                    .font(VMFont.xs)
                    .foregroundStyle(c.textFaint)
            }

            Text(previewBody(item))
                .font(VMFont.sm)
                .foregroundStyle(c.text)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: VMSpace.sm) {
                VMButton(title: S.Finance.AI.analyze, disabled: parsing) {
                    analyzeInbox(item)
                }
                VMButton(title: S.Finance.AI.pendingIgnore, variant: .outline) {
                    ignore(item)
                }
                Spacer(minLength: 0)
            }
        }
        .padding(.vertical, VMSpace.md)
    }

    private var draftsSection: some View {
        VStack(alignment: .leading, spacing: VMSpace.md) {
            HStack {
                Text("\(S.Finance.AI.draftsHeading) (\(drafts.count))")
                    .font(VMFont.semibold(14))
                    .foregroundStyle(c.text)
                Spacer()
                VMButton(title: S.Finance.AI.draftsApprove, disabled: !canApprove) {
                    approveAll()
                }
            }

            ForEach(drafts) { draft in
                draftCard(draft)
            }

            Text(S.Finance.AI.draftsFootnote)
                .font(VMFont.xs)
                .foregroundStyle(c.textFaint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// `TransactionDraftCard.svelte` karşılığı — özet hâl.
    private func draftCard(_ draft: TransactionDraft) -> some View {
        VStack(alignment: .leading, spacing: VMSpace.sm) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(draft.title)
                        .font(VMFont.medium(14))
                        .foregroundStyle(c.text)
                    Text(draft.contactDisplayName ?? "—")
                        .font(VMFont.xs)
                        .foregroundStyle(c.textFaint)
                }
                Spacer(minLength: 0)
                Text((draft.kind == .expense ? "−" : "") + VMFormat.money(draft.amount, currency: draft.currency))
                    .font(VMFont.semibold(14))
                    .monospacedDigit()
                    .foregroundStyle(draft.kind == .income ? c.success : c.text)
            }

            HStack(spacing: 6) {
                StatusBadge(label: draft.kind.label,
                            tone: draft.kind == .income ? .success : .neutral)
                if let category = draft.category {
                    StatusBadge(label: category, tone: .neutral)
                }
                if let method = draft.paymentMethod {
                    StatusBadge(label: method, tone: .info)
                }
                Spacer(minLength: 0)
                Text(VMFormat.day(draft.occurredOn))
                    .font(VMFont.xs)
                    .foregroundStyle(c.textFaint)
            }
        }
        .padding(VMSpace.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .vmCard(c)
    }

    // MARK: Eylemler

    private func previewBody(_ item: InboundMessage) -> String {
        if let body = item.body?.trimmed, !body.isEmpty { return body }
        return item.hasMedia ? S.Finance.AI.pendingEmptyBody : "—"
    }

    /// Yapıştırılan metni "ayrıştırır". Sahte parser: bilinen mesajlarla eşleşirse
    /// onların taslağını verir, aksi halde çıkarım yapılamadığını söyler.
    private func analyzePasted() {
        activeInboxId = nil
        approvedNotice = nil
        run {
            let match = MockData.inboundMessages.first { ($0.body ?? "") == message.trimmed }
            let result = match.map { MockData.drafts(for: $0.id) } ?? []
            drafts = result
            parseError = result.isEmpty ? S.Finance.AI.parseNone : nil
        }
    }

    private func analyzeInbox(_ item: InboundMessage) {
        activeInboxId = item.id
        message = item.body ?? ""
        approvedNotice = nil
        run {
            let result = MockData.drafts(for: item.id)
            drafts = result
            parseError = result.isEmpty
                ? (item.hasMedia ? "Mesajda yalnız medya var; metin çıkarılamadı." : S.Finance.AI.parseNone)
                : nil
            messages = messages.map { row in
                guard row.id == item.id else { return row }
                return InboundMessage(id: row.id, sender: row.sender, body: row.body,
                                      status: .parsed, hasMedia: row.hasMedia,
                                      createdAt: row.createdAt)
            }
        }
    }

    private func ignore(_ item: InboundMessage) {
        messages = messages.map { row in
            guard row.id == item.id else { return row }
            return InboundMessage(id: row.id, sender: row.sender, body: row.body,
                                  status: .ignored, hasMedia: row.hasMedia,
                                  createdAt: row.createdAt)
        }
        if activeInboxId == item.id {
            activeInboxId = nil
            drafts = []
            message = ""
        }
    }

    private func approveAll() {
        guard let id = activeInboxId else { return }
        messages = messages.map { row in
            guard row.id == id else { return row }
            return InboundMessage(id: row.id, sender: row.sender, body: row.body,
                                  status: .approved, hasMedia: row.hasMedia,
                                  createdAt: row.createdAt)
        }
        approvedNotice = "\(drafts.count) taslak onaylandı (mockup: sunucuya yazılmaz)."
        drafts = []
        message = ""
        activeInboxId = nil
    }

    /// Ağ yok ama "analiz ediliyor" hâli görünür olsun diye kısa gecikme.
    private func run(_ work: @escaping () -> Void) {
        parsing = true
        parseError = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            work()
            parsing = false
        }
    }
}
