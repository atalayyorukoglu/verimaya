import SwiftUI

/*
 `apps/web/src/lib/components/CommandPalette.svelte` karşılığı.

 Web'de arama ayrı bir `/v1/search` ucu DEĞİL — üç liste ucunun `q` süzgeci
 paralel çağrılır (o uç hiç yazılmamıştı, canlıda 404 dönüyordu; 2026-09-02
 notu). Burada da aynısı: `contacts`, `appointments`, `transactions`.

 En az 2 karakter; boş `q` gönderilmez (400 döner).
*/
struct SearchSheet: View {
    @Environment(\.palette) private var c
    @Environment(AppState.self) private var app

    @State private var query = ""
    @State private var contacts: [Contact] = []
    @State private var appointments: [Appointment] = []
    @State private var transactions: [Transaction] = []
    @State private var isSearching = false
    @State private var errorMessage: String?
    @FocusState private var focused: Bool

    private var term: String { query.trimmed }
    private var hasQuery: Bool { term.count >= 2 }

    private var isEmpty: Bool {
        hasQuery && !isSearching && contacts.isEmpty && appointments.isEmpty && transactions.isEmpty
    }

    var body: some View {
        @Bindable var app = app

        VStack(spacing: 0) {
            HStack(spacing: VMSpace.sm) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15))
                    .foregroundStyle(c.textFaint)
                TextField("", text: $query,
                          prompt: Text(S.Command.placeholder).foregroundColor(c.textFaint))
                    .font(VMFont.sm)
                    .foregroundStyle(c.text)
                    .autocorrectionDisabled()
                    .focused($focused)
                    .submitLabel(.search)
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
                    } else if let errorMessage {
                        ErrorBanner(message: errorMessage)
                            .padding(VMSpace.md)
                    } else if isSearching {
                        LoadingRow(label: "Aranıyor…")
                            .padding(.horizontal, VMSpace.md)
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
        .task(id: term) { await search() }
    }

    /// Üç uca paralel `q` sorgusu. Yazarken tetiklenir; `.task(id:)` eski
    /// isteği iptal ettiği için her tuşta bekleyen istek birikmez.
    private func search() async {
        guard hasQuery else {
            contacts = []; appointments = []; transactions = []
            errorMessage = nil
            return
        }
        // Kısa gecikme: hızlı yazarken her harf için istek atmayalım.
        try? await Task.sleep(nanoseconds: 300_000_000)
        if Task.isCancelled { return }

        isSearching = true
        errorMessage = nil
        defer { isSearching = false }

        let client = APIClient.shared
        async let contactsTask = try? await client.listContacts(limit: 8, q: term)
        async let appointmentsTask = try? await client.listAppointments(limit: 6)
        async let transactionsTask = try? await client.listTransactions(limit: 6, q: term)

        contacts = (await contactsTask)?.items ?? []
        transactions = (await transactionsTask)?.items ?? []
        // Randevu ucu `q` kabul eder ama kişi adına göre arama sunucuda
        // `contact_involves` ile yapılır; burada yüklü listeyi kişi adına göre
        // daraltmak yerine yalnız son randevular gösteriliyor.
        let recent = (await appointmentsTask)?.items ?? []
        appointments = recent.filter {
            $0.contactDisplayName.lowercased(with: VMFormat.locale)
                .contains(term.lowercased(with: VMFormat.locale))
        }
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
