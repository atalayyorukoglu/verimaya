import SwiftUI

/*
 `apps/web/src/routes/finance/+page.svelte` — mobil hâl, gerçek veriyle.

 Düzen mockup turundan değişmedi: başlık + "AI ile işlem" (bekleyen rozeti) +
 "Hakediş", bakiye şeridi, arama + tür/durum seçicileri + kare "+", kart listesi.

 SAYAÇ: `store.totalCount` (`total_count`).
 SÜZGEÇ: `q`, `kind`, `status`, `from`, `to` — hepsi sunucuya gider. Arama
 Enter'a basınca uygulanır: her tuşta istek atmak sunucuyu boşuna yorar ve
 `q` boş kaldığında 400 döner (boş değer gönderilmiyor).
*/
struct FinanceView: View {
    @Environment(\.palette) private var c
    @Environment(AppState.self) private var app

    @State private var store = TransactionsStore()
    @State private var inbox = InboxStore()
    @State private var searchText = ""
    @State private var appliedSearch = ""
    @State private var kindFilter = ""
    @State private var statusFilter = ""
    @State private var formTarget: TransactionFormTarget?
    @State private var balancesOpen = false

    private var period: Period { app.financePeriod }

    private var filters: TransactionsStore.Filters {
        TransactionsStore.Filters(
            query: appliedSearch.isEmpty ? nil : appliedSearch,
            kind: kindFilter.isEmpty ? nil : kindFilter,
            status: statusFilter.isEmpty ? nil : statusFilter,
            from: period.apiFrom,
            to: period.apiTo
        )
    }

    private var listDescription: String {
        guard let total = store.totalCount else { return S.Finance.description }
        let count = String(total)
        return filters.isActive
            ? vmFill(S.Finance.totalFiltered, ["count": count])
            : vmFill(S.Finance.total, ["count": count])
    }

    private var kindOptions: [(value: String, label: String)] {
        [(value: "", label: S.Finance.Filter.kindAll)]
            + TransactionKind.allCases.map { (value: $0.rawValue, label: $0.label) }
    }

    private var statusOptions: [(value: String, label: String)] {
        [(value: "", label: S.Finance.Filter.statusAll)]
            + TransactionStatus.allCases.map { (value: $0.rawValue, label: $0.label) }
    }

    private var baseCurrency: String { app.baseCurrency }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                balancesStrip
                filterControls

                if let error = store.errorMessage {
                    ErrorBanner(message: error) { reload() }
                } else if store.isLoading && !store.hasLoadedOnce {
                    LoadingRow(label: S.Finance.loading)
                } else if store.items.isEmpty {
                    EmptyStateCard {
                        Text(filters.isActive ? S.Finance.emptyFiltered : S.Finance.empty)
                            .font(VMFont.sm)
                            .foregroundStyle(c.textMuted)
                        if !filters.isActive {
                            VMButton(title: S.Finance.new) {
                                formTarget = TransactionFormTarget(transaction: nil)
                            }
                        }
                    }
                } else {
                    VStack(spacing: VMSpace.sm) {
                        ForEach(store.items) { tx in
                            row(tx)
                        }
                    }

                    if store.canLoadMore {
                        LoadMoreRow(title: S.Finance.loadMore, isLoading: store.isLoadingMore) {
                            Task { await store.loadMore(filters) }
                        }
                    }
                }
            }
            .padding(VMSpace.page)
        }
        .background(c.bg)
        .refreshable {
            await store.reload(filters)
            await store.loadBalances()
        }
        .task(id: filters.key) { await store.reload(filters) }
        .task {
            await store.loadBalances()
            await inbox.reload()
        }
        .sheet(item: $formTarget) { target in
            TransactionFormSheet(
                transaction: target.transaction,
                baseCurrency: baseCurrency,
                onSave: { body, existing in try await save(body, existing: existing) },
                onDelete: target.transaction.map { existing in { try await delete(existing) } }
            )
            .environment(\.palette, c)
        }
        .sheet(isPresented: $balancesOpen) {
            BalancesSheet(balances: store.balances, open: $balancesOpen)
                .environment(\.palette, c)
        }
    }

    // MARK: Başlık

    private var header: some View {
        VStack(alignment: .leading, spacing: VMSpace.md) {
            VStack(alignment: .leading, spacing: 4) {
                Text(S.Finance.title)
                    .font(VMFont.semibold(16))
                    .foregroundStyle(c.text)
                Text(listDescription)
                    .font(VMFont.sm)
                    .foregroundStyle(c.textMuted)
                    .accessibilityIdentifier("finance.count")
            }
            actionLinks
        }
    }

    /// "AI ile işlem" + "Hakediş" — web'de başlık eylemleri.
    /// Rozet sayısı gerçek kuyruktan (`status == new`).
    private var actionLinks: some View {
        @Bindable var app = app

        return HStack(spacing: VMSpace.sm) {
            Button {
                app.push(.aiTransaction)
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 14))
                    Text(S.Finance.aiLink)
                        .font(VMFont.medium(14))
                    if inbox.newCount > 0 {
                        Text("\(inbox.newCount)")
                            .font(.system(size: 10, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(c.text)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(c.warning)
                            .clipShape(Capsule())
                    }
                }
                .foregroundStyle(c.text)
                .padding(.horizontal, 12)
                .frame(height: VMSize.control)
                .overlay(
                    RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous)
                        .stroke(c.border, lineWidth: 1)
                )
            }
            .buttonStyle(.plain)

            Button {
                balancesOpen = true
            } label: {
                Text(S.Finance.commissionsLink)
                    .font(VMFont.medium(14))
                    .foregroundStyle(c.text)
                    .padding(.horizontal, 12)
                    .frame(height: VMSize.control)
                    .overlay(
                        RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous)
                            .stroke(c.border, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)

            Spacer(minLength: 0)
        }
    }

    // MARK: Bakiye şeridi (`GET /v1/reports/balances`)

    private var balancesStrip: some View {
        let payable = store.balances.filter { $0.net < 0 }
        let receivable = store.balances.filter { $0.net > 0 }

        return HStack(spacing: VMSpace.md) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text("\(S.Finance.Balances.summaryPayable):")
                        .foregroundStyle(c.text)
                    Text(summaryAmounts(payable))
                        .foregroundStyle(c.danger)
                }
                .font(VMFont.sm)
                .monospacedDigit()

                HStack(spacing: 6) {
                    Text("\(S.Finance.Balances.summaryReceivable):")
                        .foregroundStyle(c.text)
                    Text(summaryAmounts(receivable))
                        .foregroundStyle(c.success)
                }
                .font(VMFont.sm)
                .monospacedDigit()
            }

            Spacer(minLength: 0)

            Button {
                balancesOpen = true
            } label: {
                HStack(spacing: 2) {
                    Text(S.Finance.Balances.fullPage)
                        .font(VMFont.medium(14))
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundStyle(c.brand)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(S.Finance.Balances.title)
        }
        .padding(.horizontal, VMSpace.lg)
        .padding(.vertical, VMSpace.md)
        .vmCard(c)
        .padding(.top, VMSpace.md)
        .padding(.bottom, VMSpace.sm)
    }

    private func summaryAmounts(_ rows: [Balance]) -> String {
        if rows.isEmpty { return "—" }
        return rows
            .map { VMFormat.money(abs($0.net), currency: $0.currency) }
            .joined(separator: " · ")
    }

    // MARK: Süzgeçler

    private var filterControls: some View {
        VStack(spacing: VMSpace.sm) {
            VMTextField(placeholder: S.Finance.Filter.qPlaceholder, text: $searchText)
                .onSubmit { appliedSearch = searchText.trimmed }
                .submitLabel(.search)

            HStack(spacing: VMSpace.sm) {
                VMSelect(options: kindOptions, selection: $kindFilter,
                         accessibilityLabel: S.Finance.Filter.kindAll)
                VMSelect(options: statusOptions, selection: $statusFilter,
                         accessibilityLabel: S.Finance.Filter.statusAll)
                VMButton(title: "", systemImage: "plus") {
                    formTarget = TransactionFormTarget(transaction: nil)
                }
                .accessibilityLabel(S.Finance.new)
            }

            if !appliedSearch.isEmpty || !kindFilter.isEmpty || !statusFilter.isEmpty {
                HStack {
                    VMButton(title: S.Finance.Filter.clear, variant: .outline) {
                        searchText = ""
                        appliedSearch = ""
                        kindFilter = ""
                        statusFilter = ""
                    }
                    Spacer()
                }
            }
        }
        .padding(.bottom, VMSpace.lg)
        .overlay(alignment: .bottom) {
            Rectangle().fill(c.border).frame(height: 1)
        }
        .padding(.bottom, VMSpace.lg)
    }

    // MARK: Satır

    private func row(_ tx: Transaction) -> some View {
        Button {
            formTarget = TransactionFormTarget(transaction: tx)
        } label: {
            VStack(alignment: .leading, spacing: VMSpace.sm) {
                HStack(alignment: .top, spacing: VMSpace.sm) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tx.derivedLabel)
                            .font(VMFont.medium(14))
                            .foregroundStyle(c.text)
                            .lineLimit(1)
                        Text(VMFormat.day(tx.occurredOn))
                            .font(VMFont.xs)
                            .foregroundStyle(c.textFaint)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    VStack(alignment: .trailing, spacing: 2) {
                        Text(amountText(tx))
                            .font(VMFont.semibold(14))
                            .monospacedDigit()
                            .foregroundStyle(tx.kind == .income ? c.success : c.text)
                        if let base = baseLine(tx) {
                            Text(base)
                                .font(VMFont.xs)
                                .monospacedDigit()
                                .foregroundStyle(c.textFaint)
                        }
                    }
                }

                StatusBadge(label: tx.status.label, tone: transactionStatusTone(tx.status))
            }
            .padding(VMSpace.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .vmCard(c)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func amountText(_ tx: Transaction) -> String {
        let sign = tx.kind == .expense ? "−" : ""
        return sign + VMFormat.money(tx.amount, currency: tx.currency)
    }

    /// `baseLine` — yalnız işlem para birimi baz para biriminden farklıysa ve kur varsa.
    private func baseLine(_ tx: Transaction) -> String? {
        guard tx.currency != baseCurrency, let base = tx.amountBase else { return nil }
        let sign = tx.kind == .expense ? "−" : ""
        return sign + VMFormat.money(base, currency: baseCurrency)
    }

    private func reload() {
        Task { await store.reload(filters) }
    }

    private func save(_ body: TransactionWrite, existing: Transaction?) async throws {
        if let existing {
            try await store.update(existing.id, body)
        } else {
            try await store.create(body)
        }
        await store.reload(filters)
        await store.loadBalances()
    }

    private func delete(_ tx: Transaction) async throws {
        try await store.delete(tx.id)
        await store.reload(filters)
        await store.loadBalances()
    }
}

struct TransactionFormTarget: Identifiable {
    let transaction: Transaction?
    var id: String { transaction?.id ?? "__new__" }
}

/// `TransactionFormDialog.svelte` karşılığı.
struct TransactionFormSheet: View {
    @Environment(\.palette) private var c
    @Environment(\.dismiss) private var dismiss

    let transaction: Transaction?
    let baseCurrency: String
    let onSave: (TransactionWrite, Transaction?) async throws -> Void
    let onDelete: (() async throws -> Void)?

    @State private var contacts: [Contact] = []
    @State private var kind = TransactionKind.income.rawValue
    @State private var status = TransactionStatus.paid.rawValue
    @State private var amountText = ""
    @State private var currency = "TRY"
    @State private var title = ""
    @State private var category = ""
    @State private var contactId = ""
    @State private var occurredOn = Date()
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let currencies = ["TRY", "GBP", "EUR", "USD"]

    private var canSave: Bool { parseMoneyInput(amountText) != nil && !isSaving }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VMSpace.md) {
                Text(transaction == nil ? S.Finance.new : S.Common.edit)
                    .font(VMFont.semibold(18))
                    .foregroundStyle(c.text)

                labelled("Tür") {
                    VMSelect(options: TransactionKind.allCases.map { (value: $0.rawValue, label: $0.label) },
                             selection: $kind, accessibilityLabel: "Tür")
                }
                labelled("Tutar") {
                    HStack(spacing: VMSpace.sm) {
                        VMTextField(placeholder: "0,00", text: $amountText)
                            .keyboardType(.decimalPad)
                        VMSelect(options: currencies.map { (value: $0, label: $0) },
                                 selection: $currency, accessibilityLabel: "Para birimi")
                            .frame(width: 110)
                    }
                }
                labelled("Durum") {
                    VMSelect(options: TransactionStatus.allCases.map { (value: $0.rawValue, label: $0.label) },
                             selection: $status, accessibilityLabel: "Durum")
                }
                labelled("Başlık") { VMTextField(placeholder: "İşlem başlığı", text: $title) }
                labelled("Kategori") { VMTextField(placeholder: "Kategori", text: $category) }
                labelled("Kişi") {
                    VMSelect(options: [(value: "", label: "—")]
                                + contacts.map { (value: $0.id, label: $0.displayName) },
                             selection: $contactId, accessibilityLabel: "Kişi")
                }
                labelled("Tarih") {
                    HStack {
                        DatePicker("", selection: $occurredOn, displayedComponents: .date)
                            .labelsHidden()
                            .environment(\.locale, VMFormat.locale)
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .frame(height: VMSize.control)
                    .vmCard(c, radius: VMRadius.control)
                }

                if let errorMessage {
                    ErrorBanner(message: errorMessage)
                }

                HStack(spacing: VMSpace.sm) {
                    VMButton(title: isSaving ? S.Common.wait : S.Common.save,
                             fullWidth: true, disabled: !canSave) { submit() }
                    VMButton(title: S.Common.cancel, variant: .outline, fullWidth: true) { dismiss() }
                }
                .padding(.top, VMSpace.sm)

                if onDelete != nil {
                    Button(S.Common.delete, role: .destructive) { remove() }
                        .font(VMFont.sm)
                        .foregroundStyle(c.danger)
                        .frame(maxWidth: .infinity)
                        .disabled(isSaving)
                }
            }
            .padding(VMSpace.lg)
        }
        .background(c.bg)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .task { await loadPickers() }
    }

    private func labelled<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(VMFont.xs)
                .foregroundStyle(c.textMuted)
            content()
        }
    }

    private func loadPickers() async {
        contacts = (try? await APIClient.shared.listContacts(limit: 100))?.items ?? []
        hydrate()
    }

    private func hydrate() {
        guard let transaction else {
            currency = baseCurrency
            return
        }
        kind = transaction.kind.rawValue
        status = transaction.status.rawValue
        amountText = String(format: "%.2f", Double(transaction.amount) / 100)
            .replacingOccurrences(of: ".", with: ",")
        currency = transaction.currency
        title = transaction.title ?? ""
        category = transaction.category ?? ""
        contactId = transaction.contactId ?? ""
        occurredOn = transaction.occurredOn
    }

    private func submit() {
        guard let minor = parseMoneyInput(amountText) else { return }
        let body = TransactionWrite(
            kind: kind,
            status: status,
            amount: minor,
            currency: currency,
            occurredOn: APIDate.dayKeyString(occurredOn),
            title: title.trimmed.isEmpty ? nil : title.trimmed,
            category: category.trimmed.isEmpty ? nil : category.trimmed,
            contactId: contactId.isEmpty ? nil : contactId,
            // Sunucu "ödendi"de tutarla eşleşen `paid_amount` bekler; "ödenmedi"de 0.
            paidAmount: status == TransactionStatus.paid.rawValue ? minor
                : (status == TransactionStatus.unpaid.rawValue ? 0 : nil)
        )
        Task {
            isSaving = true
            errorMessage = nil
            do {
                try await onSave(body, transaction)
                dismiss()
            } catch {
                errorMessage = APIError.message(from: error)
            }
            isSaving = false
        }
    }

    private func remove() {
        guard let onDelete else { return }
        Task {
            isSaving = true
            errorMessage = nil
            do {
                try await onDelete()
                dismiss()
            } catch {
                errorMessage = APIError.message(from: error)
            }
            isSaving = false
        }
    }
}

/// "Hakediş" / "Detay" — `GET /v1/reports/balances`.
struct BalancesSheet: View {
    @Environment(\.palette) private var c

    let balances: [Balance]
    @Binding var open: Bool

    @State private var filter = "all"

    private var rows: [Balance] {
        switch filter {
        case "payable": return balances.filter { $0.net < 0 }
        case "receivable": return balances.filter { $0.net > 0 }
        default: return balances
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: VMSpace.md) {
            Text(S.Finance.Balances.title)
                .font(VMFont.semibold(18))
                .foregroundStyle(c.text)

            HStack(spacing: 0) {
                segment(S.Finance.Balances.filterAll, "all")
                Rectangle().fill(c.border).frame(width: 1)
                segment(S.Finance.Balances.filterPayable, "payable")
                Rectangle().fill(c.border).frame(width: 1)
                segment(S.Finance.Balances.filterReceivable, "receivable")
            }
            .frame(height: VMSize.control)
            .clipShape(RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous)
                    .stroke(c.border, lineWidth: 1)
            )

            if rows.isEmpty {
                Text(balances.isEmpty ? S.Finance.Balances.empty : S.Finance.Balances.emptyFiltered)
                    .font(VMFont.sm)
                    .foregroundStyle(c.textMuted)
            } else {
                ScrollView {
                    VStack(spacing: VMSpace.sm) {
                        ForEach(rows) { row in
                            balanceRow(row)
                        }
                    }
                }
            }

            VMButton(title: S.Common.close, variant: .outline, fullWidth: true) { open = false }
        }
        .padding(VMSpace.lg)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(c.bg)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private func segment(_ label: String, _ value: String) -> some View {
        Button {
            filter = value
        } label: {
            Text(label)
                .font(VMFont.medium(13))
                .foregroundStyle(filter == value ? c.text : c.textMuted)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(filter == value ? c.surface2 : c.surface)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func balanceRow(_ row: Balance) -> some View {
        HStack(alignment: .top, spacing: VMSpace.md) {
            Image(systemName: "arrow.left.arrow.right")
                .font(.system(size: 14))
                .foregroundStyle(c.textMuted)
                .frame(width: 32, height: 32)
                .background(c.surface2)
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 4) {
                Group {
                    if row.net < 0 {
                        Text("\(S.Finance.Balances.debtor) ")
                            .foregroundColor(c.textMuted)
                        + Text(S.Finance.Balances.selfLabel).fontWeight(.medium)
                        + Text(S.Finance.Balances.creditor).foregroundColor(c.textMuted)
                        + Text(row.contactLabel).fontWeight(.medium)
                        + Text(" (\(row.currency))").foregroundColor(c.textFaint)
                    } else {
                        Text("\(S.Finance.Balances.debtor) ")
                            .foregroundColor(c.textMuted)
                        + Text(row.contactLabel).fontWeight(.medium)
                        + Text(S.Finance.Balances.creditor).foregroundColor(c.textMuted)
                        + Text(S.Finance.Balances.selfLabel).fontWeight(.medium)
                        + Text(" (\(row.currency))").foregroundColor(c.textFaint)
                    }
                }
                .font(VMFont.sm)
                .foregroundStyle(c.text)

                if let days = row.oldestOpenDays {
                    Text(vmFill("En eski açık: {days} gün", ["days": String(days)]))
                        .font(VMFont.xs)
                        // 90+ gün kırmızı, 60+ sarı — web ile aynı eşikler.
                        .foregroundStyle(days > 90 ? c.danger : (days > 60 ? c.warning : c.textMuted))
                }
            }

            Spacer(minLength: 0)

            Text(VMFormat.money(abs(row.net), currency: row.currency))
                .font(VMFont.semibold(14))
                .monospacedDigit()
                .foregroundStyle(row.net < 0 ? c.danger : c.success)
        }
        .padding(.horizontal, VMSpace.lg)
        .padding(.vertical, VMSpace.md)
        .vmCard(c)
    }
}

/// `parseMoneyInput` (format.ts) — "1.000,50" / "1000.5" → 100050; geçersiz → nil.
func parseMoneyInput(_ value: String) -> Int? {
    let raw = value.trimmed.replacingOccurrences(of: " ", with: "")
    if raw.isEmpty { return nil }

    var normalized = raw
    let lastComma = raw.lastIndex(of: ",")
    let lastDot = raw.lastIndex(of: ".")

    if let comma = lastComma, let dot = lastDot {
        if comma > dot {
            normalized = raw.replacingOccurrences(of: ".", with: "")
                .replacingOccurrences(of: ",", with: ".")
        } else {
            normalized = raw.replacingOccurrences(of: ",", with: "")
        }
    } else if lastComma != nil {
        normalized = raw.replacingOccurrences(of: ",", with: ".")
    } else if raw.range(of: "^\\d{1,3}(\\.\\d{3})+$", options: .regularExpression) != nil {
        normalized = raw.replacingOccurrences(of: ".", with: "")
    }

    guard let major = Double(normalized), major.isFinite else { return nil }
    return Int((major * 100).rounded())
}
