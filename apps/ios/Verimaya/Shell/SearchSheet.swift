import SwiftUI

/*
 `apps/web/src/lib/components/CommandPalette.svelte` karşılığı.

 Mobilde tetikleyici kabuk başlığındaki arama ikonu. Üç grupta sonuç:
 Kişiler, Randevular, İşlemler — web'de üç liste ucunun `q` süzgeci; burada
 aynı süzgeç sahte veri üzerinde çalışır (en az 2 karakter).

 Sonuca dokununca ilgili sekmeye gider — mockup içinde gerçekten iş yapar.
*/
struct SearchSheet: View {
    @Environment(\.palette) private var c
    @Environment(AppState.self) private var app

    @State private var query = ""
    @FocusState private var focused: Bool

    private var term: String { query.trimmed.lowercased(with: VMFormat.locale) }
    private var hasQuery: Bool { term.count >= 2 }

    private var contacts: [Contact] {
        guard hasQuery else { return [] }
        return MockData.contacts
            .filter { $0.displayName.lowercased(with: VMFormat.locale).contains(term) }
            .prefix(8)
            .map { $0 }
    }

    private var appointments: [Appointment] {
        guard hasQuery else { return [] }
        return MockData.appointments
            .filter { $0.contactDisplayName.lowercased(with: VMFormat.locale).contains(term) }
            .prefix(6)
            .map { $0 }
    }

    private var transactions: [Transaction] {
        guard hasQuery else { return [] }
        return MockData.transactions
            .filter { tx in
                let haystack = [tx.derivedLabel, tx.contactDisplayName ?? "", tx.category ?? ""]
                    .joined(separator: " ")
                    .lowercased(with: VMFormat.locale)
                return haystack.contains(term)
            }
            .prefix(6)
            .map { $0 }
    }

    private var isEmpty: Bool {
        hasQuery && contacts.isEmpty && appointments.isEmpty && transactions.isEmpty
    }

    var body: some View {
        @Bindable var app = app

        VStack(spacing: 0) {
            HStack(spacing: VMSpace.sm) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15))
                    .foregroundStyle(c.textFaint)
                TextField("", text: $query, prompt: Text(S.Command.placeholder).foregroundColor(c.textFaint))
                    .font(VMFont.sm)
                    .foregroundStyle(c.text)
                    .autocorrectionDisabled()
                    .focused($focused)
                Button(S.Common.close) { app.searchOpen = false }
                    .font(VMFont.sm)
                    .foregroundStyle(c.textMuted)
            }
            .padding(.horizontal, VMSpace.md)
            .frame(height: 48)

            Divider().overlay(c.border)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if !hasQuery {
                        hint(S.Command.minChars)
                    } else if isEmpty {
                        hint(S.Command.empty)
                    } else {
                        if !contacts.isEmpty {
                            groupLabel(S.Nav.contacts)
                            ForEach(contacts) { contact in
                                row(icon: "person", title: contact.displayName,
                                    detail: contact.phone ?? contact.email ?? "—") {
                                    app.go(.contacts)
                                    app.searchOpen = false
                                }
                            }
                        }
                        if !appointments.isEmpty {
                            groupLabel(S.Nav.appointments)
                            ForEach(appointments) { appt in
                                row(icon: "calendar", title: appt.contactDisplayName,
                                    detail: VMFormat.dateTime(appt.startsAt)) {
                                    app.go(.appointments)
                                    app.searchOpen = false
                                }
                            }
                        }
                        if !transactions.isEmpty {
                            groupLabel(S.Command.groupTransactions)
                            ForEach(transactions) { tx in
                                row(icon: "creditcard", title: tx.derivedLabel,
                                    detail: VMFormat.money(tx.amount, currency: tx.currency)) {
                                    app.go(.finance)
                                    app.searchOpen = false
                                }
                            }
                        }
                    }
                }
                .padding(.vertical, VMSpace.sm)
            }
        }
        .background(c.surface)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .onAppear { focused = true }
    }

    private func groupLabel(_ text: String) -> some View {
        Text(text)
            .font(VMFont.semibold(11))
            .foregroundStyle(c.textFaint)
            .textCase(.uppercase)
            .padding(.horizontal, VMSpace.md)
            .padding(.top, VMSpace.md)
            .padding(.bottom, 4)
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(VMFont.sm)
            .foregroundStyle(c.textMuted)
            .padding(VMSpace.lg)
    }

    private func row(icon: String, title: String, detail: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: VMSpace.md) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundStyle(c.textMuted)
                    .frame(width: 20)
                Text(title)
                    .font(VMFont.sm)
                    .foregroundStyle(c.text)
                    .lineLimit(1)
                Spacer(minLength: VMSpace.sm)
                Text(detail)
                    .font(VMFont.xs)
                    .foregroundStyle(c.textFaint)
                    .lineLimit(1)
            }
            .padding(.horizontal, VMSpace.md)
            .frame(height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
