import SwiftUI

struct PatientFormView: View {
  enum Mode {
    case create
    case edit(Patient)
  }

  let mode: Mode
  @ObservedObject var vm: PatientsViewModel

  @Environment(\.dismiss) private var dismiss

  @State private var fullName = ""
  @State private var phone = ""
  @State private var email = ""
  @State private var status: PatientStatus = .lead
  @State private var source = ""
  @State private var notes = ""
  @State private var isSaving = false
  @State private var formError: String?

  private var canSave: Bool {
    !fullName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSaving
  }

  var body: some View {
    NavigationStack {
      Form {
        if let formError {
          Section {
            Text(formError)
              .font(.footnote)
              .foregroundStyle(VerimayaTheme.danger)
          }
        }

        Section {
          TextField("Ad", text: $fullName)
          TextField("Telefon", text: $phone)
            .keyboardType(.phonePad)
          TextField("E-posta", text: $email)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          Picker("Durum", selection: $status) {
            ForEach(PatientStatus.allCases) { s in
              Text(s.label).tag(s)
            }
          }
          TextField("Kaynak", text: $source)
          TextField("Notlar", text: $notes, axis: .vertical)
            .lineLimit(3...8)
        }
      }
      .scrollContentBackground(.hidden)
      .background(VerimayaTheme.bg)
      .navigationTitle(title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Vazgeç") { dismiss() }
            .disabled(isSaving)
        }
        ToolbarItem(placement: .confirmationAction) {
          if isSaving {
            ProgressView()
          } else {
            Button("Kaydet") {
              Task { await save() }
            }
            .disabled(!canSave)
          }
        }
      }
      .interactiveDismissDisabled(isSaving)
      .onAppear { seed() }
    }
  }

  private var title: String {
    switch mode {
    case .create: "Yeni hasta"
    case .edit: "Hastayı düzenle"
    }
  }

  private func seed() {
    guard case let .edit(patient) = mode else { return }
    fullName = patient.fullName
    phone = patient.phone ?? ""
    email = patient.email ?? ""
    status = patient.status
    source = patient.source ?? ""
    notes = patient.notes ?? ""
  }

  private func save() async {
    let name = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty else { return }

    isSaving = true
    formError = nil
    defer { isSaving = false }

    let phoneVal = optionalTrimmed(phone)
    let emailVal = optionalTrimmed(email)
    let sourceVal = optionalTrimmed(source)
    let notesVal = optionalTrimmed(notes)

    let ok: Bool
    switch mode {
    case .create:
      ok = await vm.create(PatientCreate(
        fullName: name,
        phone: phoneVal,
        email: emailVal,
        status: status,
        source: sourceVal,
        notes: notesVal
      ))
    case let .edit(patient):
      ok = await vm.update(id: patient.id, PatientUpdate(
        fullName: name,
        phone: phoneVal,
        email: emailVal,
        status: status,
        source: sourceVal,
        notes: notesVal
      ))
    }

    if ok {
      dismiss()
    } else {
      formError = vm.statusMessage ?? "Kayıt başarısız."
    }
  }

  private func optionalTrimmed(_ s: String) -> String? {
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    return t.isEmpty ? nil : t
  }
}
