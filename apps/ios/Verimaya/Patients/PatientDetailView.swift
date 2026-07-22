import SwiftUI

struct PatientDetailView: View {
  let id: String
  @ObservedObject var vm: PatientsViewModel

  @Environment(\.dismiss) private var dismiss

  @State private var patient: Patient?
  @State private var finance: PatientFinanceSummary?
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
      } else if let errorMessage, patient == nil {
        ContentUnavailableView(
          "Hasta yüklenemedi",
          systemImage: "exclamationmark.triangle",
          description: Text(errorMessage)
        )
      } else if let patient {
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

            identityCard(patient)
            if let notes = patient.notes, !notes.isEmpty {
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
    .navigationTitle(patient?.fullName ?? "Hasta")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItemGroup(placement: .topBarTrailing) {
        Button("Düzenle") { showEdit = true }
          .disabled(patient == nil || isDeleting)
        Button("Sil", role: .destructive) { confirmDelete = true }
          .disabled(patient == nil || isDeleting)
      }
    }
    .confirmationDialog("Hastayı silmek istediğinize emin misiniz?", isPresented: $confirmDelete, titleVisibility: .visible) {
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
      if let patient {
        PatientFormView(mode: .edit(patient), vm: vm)
      }
    }
    .task { await load() }
  }

  private func load() async {
    isLoading = patient == nil
    errorMessage = nil
    do {
      async let p = APIClient.shared.getPatient(id)
      async let f = APIClient.shared.patientFinanceSummary(id)
      patient = try await p
      finance = try await f
    } catch {
      errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
    }
    isLoading = false
  }

  private func identityCard(_ patient: Patient) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        Text(patient.fullName)
          .font(.title3.weight(.semibold))
          .foregroundStyle(VerimayaTheme.text)
        Spacer()
        Text(patient.status.label)
          .font(.caption.weight(.medium))
          .foregroundStyle(VerimayaTheme.text)
          .padding(.horizontal, 8)
          .padding(.vertical, 4)
          .background(VerimayaTheme.brandSubtle)
          .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
      }

      detailRow(label: "Telefon", value: patient.phone)
      detailRow(label: "E-posta", value: patient.email)
      detailRow(label: "Kaynak", value: patient.source)
      detailRow(label: "Oluşturulma", value: DateFmt.day(patient.createdAt))
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

  private func financeCard(_ summary: PatientFinanceSummary) -> some View {
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
