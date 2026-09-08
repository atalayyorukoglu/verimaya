import SwiftUI

/*
 `apps/web/src/routes/finance/ai-transaction/+page.svelte` — mobil hâl, gerçek
 uçlarla.

 Uçlar:
   • `GET  /v1/whatsapp/inbox`            → kuyruk (zarf **`messages`**, arşiv dersi #5)
   • `POST /v1/whatsapp/parse`            → yapıştırılan metni ayrıştır
   • `POST /v1/whatsapp/inbox/:id/parse`  → kuyruktaki mesajı ayrıştır
   • `POST /v1/whatsapp/inbox/process`    → gövdesi olan tüm `new` mesajları ayrıştır
   • `POST /v1/whatsapp/inbox/:id/ignore` → yoksay

 AGENTS.md ilke 6: AI çıkarımı TASLAKTIR, onaysız kayda geçmez. "Onayla ve
 kaydet" bu turda YOK: `approve-drafts` her taslak için kur, ödeme durumu,
 ödenen tutar ve karşı taraf ister; o form ayrı bir iş. Karşılığı olmayan düğme
 koymuyoruz (arşiv dersi #8).
*/
struct AITransactionView: View {
    @Environment(\.palette) private var c
    @Environment(AppState.self) private var app

    @State private var store = InboxStore()
    @State private var message = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VMSpace.lg) {
                backButton
                headerBlock
                pasteCard
                pendingCard
                if !store.drafts.isEmpty { draftsSection }
            }
            .padding(VMSpace.page)
        }
        .background(c.bg)
        .refreshable { await store.reload() }
        .task { await store.reload() }
    }

    private var backButton: some View {
        @Bindable var app = app

        return Button {
            if !app.financePath.isEmpty { app.financePath.removeLast() }
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
                        .accessibilityIdentifier("ai.message")
                }
                .background(c.surface2)
                .clipShape(RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous)
                        .stroke(c.border, lineWidth: 1)
                )

                if let parseError = store.parseError {
                    Text(parseError)
                        .font(VMFont.sm)
                        .foregroundStyle(c.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: VMSpace.sm) {
                    VMButton(title: store.isParsing ? S.Finance.AI.analyzing : S.Finance.AI.analyze,
                             systemImage: "sparkles",
                             disabled: store.isParsing || message.trimmed.isEmpty) {
                        Task { await store.analyze(text: message) }
                    }
                    if store.activeMessageId != nil {
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
            title: store.newCount > 0
                ? "\(S.Finance.AI.pendingHeading) (\(store.newCount))"
                : S.Finance.AI.pendingHeading,
            trailing: AnyView(
                VMButton(
                    title: store.isProcessing ? S.Finance.AI.pendingProcessing : S.Finance.AI.pendingProcess,
                    variant: .outline,
                    disabled: store.isProcessing
                ) {
                    Task { await store.processNew() }
                }
            )
        ) {
            if let error = store.errorMessage {
                ErrorBanner(message: error) { Task { await store.reload() } }
            } else if store.isLoading && !store.hasLoadedOnce {
                LoadingRow()
            } else if store.pending.isEmpty {
                Text(S.Finance.AI.pendingEmpty)
                    .font(VMFont.sm)
                    .foregroundStyle(c.textMuted)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(store.pending.enumerated()), id: \.element.id) { index, item in
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
                Text(item.chatName ?? item.sender)
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
                VMButton(title: S.Finance.AI.analyze, disabled: store.isParsing) {
                    Task { await store.analyze(message: item) }
                }
                VMButton(title: S.Finance.AI.pendingIgnore, variant: .outline) {
                    Task { await store.ignore(item) }
                }
                Spacer(minLength: 0)
            }
        }
        .padding(.vertical, VMSpace.md)
    }

    private var draftsSection: some View {
        VStack(alignment: .leading, spacing: VMSpace.md) {
            Text("\(S.Finance.AI.draftsHeading) (\(store.drafts.count))")
                .font(VMFont.semibold(14))
                .foregroundStyle(c.text)

            ForEach(store.drafts) { draft in
                draftCard(draft)
            }

            Text(S.Finance.AI.draftsFootnote)
                .font(VMFont.xs)
                .foregroundStyle(c.textFaint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// `TransactionDraftCard.svelte` karşılığı — özet hâl (onay formu ayrı iş).
    private func draftCard(_ draft: TransactionDraft) -> some View {
        VStack(alignment: .leading, spacing: VMSpace.sm) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(draft.displayTitle)
                        .font(VMFont.medium(14))
                        .foregroundStyle(c.text)
                    Text(draft.contactLabel ?? "—")
                        .font(VMFont.xs)
                        .foregroundStyle(c.textFaint)
                }
                Spacer(minLength: 0)
                Text((draft.kind == .expense ? "−" : "")
                     + VMFormat.money(draft.amount, currency: draft.currency))
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
                if let occurredOn = draft.occurredOn {
                    Text(VMFormat.day(occurredOn))
                        .font(VMFont.xs)
                        .foregroundStyle(c.textFaint)
                }
            }
        }
        .padding(VMSpace.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .vmCard(c)
    }

    private func previewBody(_ item: InboundMessage) -> String {
        if let body = item.body?.trimmed, !body.isEmpty { return body }
        return item.hasMedia ? S.Finance.AI.pendingEmptyBody : "—"
    }
}
