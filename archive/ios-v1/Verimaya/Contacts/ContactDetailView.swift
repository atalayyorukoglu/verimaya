import SwiftUI

struct ContactDetailView: View {
  let id: String
  @ObservedObject var vm: ContactsViewModel

  @Environment(\.dismiss) private var dismiss

  @State private var contact: Contact?
  @State private var finance: ContactFinanceSummary?
  @State private var isLoading = true
  @State private var errorMessage: String?
  @State private var showEdit = false
  @State private var confirmDelete = false
  @State private var isDeleting = false

  var body: some View {
    ZStack {
      VerimayaTheme.bg.ignoresSafeArea()

      if isLoading {
        ProgressView("Yükleniyor…")
          .tint(VerimayaTheme.brand)
      } else if let errorMessage, contact == nil {
        ContentUnavailableView(
          "Kişi yüklenemedi",
          systemImage: "exclamationmark.triangle",
          description: Text(errorMessage)
        )
      } else if let contact {
        ScrollView {
          VStack(alignment: .leading, spacing: 16) {
            if let errorMessage {
              Text(errorMessage)
                .font(.footnote)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(VerimayaTheme.danger)
                .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
            }

            identityCard(contact)
            if let notes = contact.notes, !notes.isEmpty {
              notesCard(notes)
            }
            if let finance {
              financeCard(finance)
            }
          }
          .padding(16)
        }
      }
    }
    .navigationTitle(contact?.displayName ?? "Kişi")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItemGroup(placement: .topBarTrailing) {
        Button("Düzenle") { showEdit = true }
          .disabled(contact == nil || isDeleting)
        Button("Sil", role: .destructive) { confirmDelete = true }
          .disabled(contact == nil || isDeleting)
      }
    }
    .confirmationDialog("Kişiyı silmek istediğinize emin misiniz?", isPresented: $confirmDelete, titleVisibility: .visible) {
      Button("Sil", role: .destructive) {
        Task {
          isDeleting = true
          let ok = await vm.delete(id: id)
          isDeleting = false
          if ok { dismiss() }
          else { errorMessage = vm.statusMessage }
        }
      }
      Button("Vazgeç", role: .cancel) {}
    }
    .sheet(isPresented: $showEdit, onDismiss: {
      Task { await load() }
    }) {
      if let contact {
        ContactFormView(mode: .edit(contact), vm: vm)
      }
    }
    .task { await load() }
  }

  private func load() async {
    isLoading = contact == nil
    errorMessage = nil
    do {
      async let p = APIClient.shared.getContact(id)
      async let f = APIClient.shared.contactFinanceSummary(id)
      contact = try await p
      finance = try await f
    } catch {
      errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
    }
    isLoading = false
  }

  private func identityCard(_ contact: Contact) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        Text(contact.displayName)
          .font(.title3.weight(.semibold))
          .foregroundStyle(VerimayaTheme.text)
        Spacer()
        Text(contact.status?.label ?? contact.contactTypeName)
          .font(.caption.weight(.medium))
          .foregroundStyle(VerimayaTheme.text)
          .padding(.horizontal, 8)
          .padding(.vertical, 4)
          .background(VerimayaTheme.brandSubtle)
          .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
      }

      detailRow(label: "Telefon", value: contact.phone)
      detailRow(label: "E-posta", value: contact.email)
      detailRow(label: "Tür", value: contact.contactTypeName)
      detailRow(label: "Kaynak", value: contact.source)
      detailRow(label: "Oluşturulma", value: DateFmt.day(contact.createdAt))
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(VerimayaTheme.surface)
    .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusCard))
    .overlay(
      RoundedRectangle(cornerRadius: VerimayaTheme.radiusCard)
        .stroke(VerimayaTheme.border, lineWidth: 1)
    )
  }

  private func notesCard(_ notes: String) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Notlar")
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(VerimayaTheme.textMuted)
      Text(notes)
        .font(.body)
        .foregroundStyle(VerimayaTheme.text)
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(VerimayaTheme.surface)
    .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusCard))
    .overlay(
      RoundedRectangle(cornerRadius: VerimayaTheme.radiusCard)
        .stroke(VerimayaTheme.border, lineWidth: 1)
    )
  }

  private func financeCard(_ summary: ContactFinanceSummary) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Finans özeti")
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(VerimayaTheme.textMuted)

      financeRow(label: "Gelir", value: Money.format(minor: summary.incomeBase))
      financeRow(label: "Gider", value: Money.format(minor: summary.expenseBase))
      financeRow(label: "Ödenen", value: Money.format(minor: summary.paidBase))
      financeRow(label: "Kalan", value: Money.format(minor: summary.outstandingBase))
      financeRow(label: "İşlem sayısı", value: "\(summary.transactionCount)")
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(VerimayaTheme.surface)
    .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusCard))
    .overlay(
      RoundedRectangle(cornerRadius: VerimayaTheme.radiusCard)
        .stroke(VerimayaTheme.border, lineWidth: 1)
    )
  }

  private func detailRow(label: String, value: String?) -> some View {
    HStack(alignment: .top) {
      Text(label)
        .font(.subheadline)
        .foregroundStyle(VerimayaTheme.textMuted)
        .frame(width: 100, alignment: .leading)
      Text(value?.isEmpty == false ? value! : "—")
        .font(.subheadline)
        .foregroundStyle(VerimayaTheme.text)
      Spacer(minLength: 0)
    }
  }

  private func financeRow(label: String, value: String) -> some View {
    HStack {
      Text(label)
        .font(.subheadline)
        .foregroundStyle(VerimayaTheme.textMuted)
      Spacer()
      Text(value)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(VerimayaTheme.text)
        .monospacedDigit()
    }
  }
}
