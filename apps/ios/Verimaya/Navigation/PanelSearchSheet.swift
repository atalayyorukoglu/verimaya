import SwiftUI

/// Üst şeritteki arama — web'deki komut paletinin karşılığı.
/// "Hasta, randevu veya işlem ara…": üç uca da `q` gönderir, sonucu gruplar.
struct PanelSearchSheet: View {
  /// Sonuca dokunulunca hangi sekmeye gidileceği.
  let onOpen: (PanelTab) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var query = ""
  @State private var contacts: [Contact] = []
  @State private var appointments: [Appointment] = []
  @State private var transactions: [Transaction] = []
  @State private var isSearching = false
  @State private var errorText: String?
  @State private var searchTask: Task<Void, Never>?

  private var isEmpty: Bool {
    contacts.isEmpty && appointments.isEmpty && transactions.isEmpty
  }

  var body: some View {
    NavigationStack {
      ZStack {
        VerimayaTheme.bg.ignoresSafeArea()

        VStack(spacing: 0) {
          if let errorText {
            Text(errorText)
              .font(.footnote)
              .foregroundStyle(VerimayaTheme.danger)
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(VerimayaUI.pagePadding)
          }

          if query.trimmingCharacters(in: .whitespaces).count < 2 {
            hint("Aramak için en az iki harf yaz.")
          } else if isSearching && isEmpty {
            ProgressView().padding(.top, 40)
            Spacer()
          } else if isEmpty {
            hint("Sonuç yok.")
          } else {
            List {
              if !contacts.isEmpty {
                Section("Kişiler") {
                  ForEach(contacts) { contact in
                    row(title: contact.displayName, detail: contact.phone.dashed) {
                      onOpen(.contacts)
                    }
                  }
                }
              }
              if !appointments.isEmpty {
                Section("Randevular") {
                  ForEach(appointments) { appointment in
                    row(
                      title: appointment.contactDisplayName,
                      detail: DateFmt.dateTime(appointment.startsAt)
                    ) { onOpen(.appointments) }
                  }
                }
              }
              if !transactions.isEmpty {
                Section("İşlemler") {
                  ForEach(transactions) { transaction in
                    row(
                      title: transaction.title,
                      detail: Money.format(
                        minor: transaction.amountBase ?? transaction.amount,
                        currency: (transaction.baseCurrency ?? transaction.currency).rawValue
                      )
                    ) { onOpen(.finance) }
                  }
                }
              }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
          }
        }
      }
      .navigationTitle("Ara")
      .navigationBarTitleDisplayMode(.inline)
      .searchable(
        text: $query,
        placement: .navigationBarDrawer(displayMode: .always),
        prompt: "Hasta, randevu veya işlem ara…"
      )
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Kapat") { dismiss() }
        }
      }
      .onChange(of: query) { _, value in
        // Her harfte istek atmamak için kısa gecikme.
        searchTask?.cancel()
        searchTask = Task {
          try? await Task.sleep(for: .milliseconds(300))
          guard !Task.isCancelled else { return }
          await run(value)
        }
      }
    }
  }

  private func hint(_ text: String) -> some View {
    VStack {
      Text(text)
        .font(.subheadline)
        .foregroundStyle(VerimayaTheme.textMuted)
        .padding(.top, 40)
      Spacer()
    }
  }

  private func row(title: String, detail: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack {
        Text(title)
          .foregroundStyle(VerimayaTheme.text)
          .lineLimit(1)
        Spacer(minLength: 8)
        Text(detail)
          .font(.subheadline)
          .foregroundStyle(VerimayaTheme.textMuted)
          .lineLimit(1)
      }
    }
    .listRowBackground(VerimayaTheme.surface)
  }

  private func run(_ raw: String) async {
    let needle = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard needle.count >= 2 else {
      contacts = []; appointments = []; transactions = []
      return
    }
    isSearching = true
    errorText = nil
    defer { isSearching = false }

    let api = APIClient.shared
    async let c = try? await api.listContacts(limit: 8, q: needle)
    async let a = try? await api.listAppointments(limit: 8, q: needle)
    async let t = try? await api.listTransactions(limit: 8, q: needle)

    let (contactPage, appointmentPage, transactionPage) = await (c, a, t)
    guard !Task.isCancelled else { return }

    contacts = contactPage?.items ?? []
    appointments = appointmentPage?.items ?? []
    transactions = transactionPage?.items ?? []

    if contactPage == nil, appointmentPage == nil, transactionPage == nil {
      errorText = "Arama yapılamadı."
    }
  }
}
