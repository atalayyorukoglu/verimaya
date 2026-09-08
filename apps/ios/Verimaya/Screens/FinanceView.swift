import SwiftUI

/*
 `apps/web/src/routes/finance/+page.svelte` — mobil hâl.

 Web mobil düzeni:
   • `PageHeader`: "İşlemler" + sayaç açıklaması; eylemler sağda iki bağlantı —
     "AI ile işlem" (kıvılcım ikonu + bekleyen sayısı rozeti) ve "Hakediş".
     Mobilde ikisi de `h-11`, `rounded-[6px]`, `border`.
   • `BalancesPanel collapsible` — özet şerit: "Borç: … - Alacak: …" + "Detay".
   • Süzgeç formu: arama alanı tam genişlik (`h-11`), altında tür + durum
     seçicileri ve kare "+" düğmesi. Kategori/tarih alanları `max-md:hidden`
     (tarih kabuk başlığında).
   • Liste (`md:hidden`): kart başına başlık (text-sm medium) + tarih (text-xs
     faint) solda; sağda tutar (gider ise "−" öneki, gelir `text-success`),
     altında baz para karşılığı; en altta durum rozeti.
*/
struct FinanceView: View {
    @Environment(\.palette) private var c
    @Environment(AppState.self) private var app

    @State private var transactions = MockData.transactions
    @State private var query = ""
    @State private var kindFilter = ""
    @State private var statusFilter = ""
    @State private var formTarget: TransactionFormTarget?
    @State private var balancesOpen = false

    private var period: Period { app.financePeriod }

    private var pendingInboxCount: Int {
        MockData.inboundMessages.filter { $0.status == .new }.count
    }

    private var filtersActive: Bool {
        !query.trimmed.isEmpty || !kindFilter.isEmpty || !statusFilter.isEmpty
            || period.range != nil
    }

    private var filtered: [Transaction] {
        let term = query.trimmed.lowercased(with: VMFormat.locale)
        return transactions
            .filter { period.contains($0.occurredOn) }
            .filter { kindFilter.isEmpty || $0.kind.rawValue == kindFilter }
            .filter { statusFilter.isEmpty || $0.status.rawValue == statusFilter }
            .filter { tx in
                guard !term.isEmpty else { return true }
                let haystack = [tx.derivedLabel, tx.contactDisplayName ?? "", tx.category ?? "", tx.subtitle ?? ""]
                    .joined(separator: " ")
                    .lowercased(with: VMFormat.locale)
                return haystack.contains(term)
            }
            .sorted { $0.occurredOn > $1.occurredOn }
    }

    private var listDescription: String {
        let count = String(filtered.count)
        return filtersActive
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

    var body: some View {
        @Bindable var app = app

        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                balancesStrip
                filters

                if filtered.isEmpty {
                    EmptyStateCard {
                        Text(filtersActive ? S.Finance.emptyFiltered : S.Finance.empty)
                            .font(VMFont.sm)
                            .foregroundStyle(c.textMuted)
                        if !filtersActive {
                            VMButton(title: S.Finance.new) {
                                formTarget = TransactionFormTarget(transaction: nil)
                            }
                        }
                    }
                } else {
                    VStack(spacing: VMSpace.sm) {
                        ForEach(filtered) { tx in
                            row(tx)
                        }
                    }
                }
            }
            .padding(VMSpace.page)
        }
        .background(c.bg)
        .sheet(item: $formTarget) { target in
            TransactionFormSheet(
                transaction: target.transaction,
                onSave: save,
                onDelete: target.transaction.map { existing in { delete(existing) } }
            )
            .environment(\.palette, c)
        }
        .sheet(isPresented: $balancesOpen) {
            BalancesSheet(open: $balancesOpen)
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
            }
            actionLinks
        }
    }

    /// "AI ile işlem" + "Hakediş" — web'de başlık eylemleri.
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
                    if pendingInboxCount > 0 {
                        Text("\(pendingInboxCount)")
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
        .padding(.bottom, VMSpace.md)
    }

    // MARK: Bakiye şeridi

    /// `BalancesPanel collapsible` — "Borç: … - Alacak: …" + "Detay".
    private var balancesStrip: some View {
        let payable = MockData.balances.filter { $0.net < 0 }
        let receivable = MockData.balances.filter { $0.net > 0 }

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
        .padding(.bottom, VMSpace.sm)
    }

    private func summaryAmounts(_ rows: [Balance]) -> String {
        if rows.isEmpty { return "—" }
        return rows
            .map { VMFormat.money(abs($0.net), currency: $0.currency) }
            .joined(separator: " · ")
    }

    // MARK: Süzgeçler

    private var filters: some View {
        VStack(spacing: VMSpace.sm) {
            VMTextField(placeholder: S.Finance.Filter.qPlaceholder, text: $query)

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

            if !query.trimmed.isEmpty || !kindFilter.isEmpty || !statusFilter.isEmpty {
                HStack {
                    VMButton(title: S.Finance.Filter.clear, variant: .outline) {
                        query = ""
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
        guard tx.currency != MockData.baseCurrency, let base = tx.amountBase else { return nil }
        let sign = tx.kind == .expense ? "−" : ""
        return sign + VMFormat.money(base, currency: MockData.baseCurrency)
    }

    private func save(_ tx: Transaction) {
        if let index = transactions.firstIndex(where: { $0.id == tx.id }) {
            transactions[index] = tx
        } else {
            transactions.insert(tx, at: 0)
        }
        formTarget = nil
    }

    private func delete(_ tx: Transaction) {
        transactions.removeAll { $0.id == tx.id }
        formTarget = nil
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
    let onSave: (Transaction) -> Void
    let onDelete: (() -> Void)?

    @State private var kind = TransactionKind.income.rawValue
    @State private var status = TransactionStatus.paid.rawValue
    @State private var amountText = ""
    @State private var currency = "TRY"
    @State private var title = ""
    @State private var category = ""
    @State private var contactName = ""
    @State private var occurredOn = Date()

    private let currencies = ["TRY", "GBP", "EUR", "USD"]

    private var canSave: Bool { parseMoneyInput(amountText) != nil }

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
                                + MockData.contacts.map { (value: $0.displayName, label: $0.displayName) },
                             selection: $contactName, accessibilityLabel: "Kişi")
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

                HStack(spacing: VMSpace.sm) {
                    VMButton(title: "Kaydet", fullWidth: true, disabled: !canSave) { submit() }
                    VMButton(title: S.Common.cancel, variant: .outline, fullWidth: true) { dismiss() }
                }
                .padding(.top, VMSpace.sm)

                if let onDelete {
                    Button("Sil", role: .destructive) { onDelete() }
                        .font(VMFont.sm)
                        .foregroundStyle(c.danger)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(VMSpace.lg)
        }
        .background(c.bg)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .onAppear(perform: hydrate)
    }

    private func labelled<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(VMFont.xs)
                .foregroundStyle(c.textMuted)
            content()
        }
    }

    private func hydrate() {
        guard let transaction else { return }
        kind = transaction.kind.rawValue
        status = transaction.status.rawValue
        amountText = String(format: "%.2f", Double(transaction.amount) / 100)
            .replacingOccurrences(of: ".", with: ",")
        currency = transaction.currency
        title = transaction.title ?? ""
        category = transaction.category ?? ""
        contactName = transaction.contactDisplayName ?? ""
        occurredOn = transaction.occurredOn
    }

    private func submit() {
        guard let minor = parseMoneyInput(amountText) else { return }
        let record = Transaction(
            id: transaction?.id ?? "t-\(UUID().uuidString.prefix(6))",
            kind: TransactionKind(rawValue: kind) ?? .income,
            status: TransactionStatus(rawValue: status) ?? .paid,
            amount: minor,
            currency: currency,
            amountBase: currency == MockData.baseCurrency ? minor : transaction?.amountBase,
            occurredOn: occurredOn,
            title: title.trimmed.isEmpty ? nil : title.trimmed,
            category: category.trimmed.isEmpty ? nil : category.trimmed,
            subtitle: transaction?.subtitle,
            contactDisplayName: contactName.isEmpty ? nil : contactName,
            description: transaction?.description
        )
        onSave(record)
        dismiss()
    }
}

/// "Hakediş" / "Detay" — web'de `/finance/commissions` ve `/finance/balances`.
/// Mockup'ta tek yüzey: bakiye listesi (borç/alacak süzgeciyle).
struct BalancesSheet: View {
    @Environment(\.palette) private var c
    @Binding var open: Bool

    @State private var filter = "all"

    private var rows: [Balance] {
        switch filter {
        case "payable": return MockData.balances.filter { $0.net < 0 }
        case "receivable": return MockData.balances.filter { $0.net > 0 }
        default: return MockData.balances
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
                Text(S.Finance.Balances.emptyFiltered)
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
                        .foregroundStyle(c.textFaint)
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
