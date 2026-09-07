import SwiftUI

/// Kişi ekleme / düzenleme.
///
/// Sunucu sözleşmesi (`contactCreateSchema`): ad ve **kişi tipi** zorunlu,
/// soyad opsiyonel, görünen ad sunucuda türetiliyor — buradan gönderilmez.
/// Durum yalnız "Hasta" tipinde anlamlı olduğu için opsiyonel bırakıldı.
struct ContactFormView: View {
  enum Mode {
    case create
    case edit(Contact)
  }

  let mode: Mode
  @ObservedObject var vm: ContactsViewModel

  @Environment(\.dismiss) private var dismiss

  @State private var firstName = ""
  @State private var lastName = ""
  @State private var contactTypeId = ""
  @State private var phone = ""
  @State private var email = ""
  @State private var status: ContactStatus?
  @State private var source = ""
  @State private var notes = ""
  @State private var isSaving = false
  @State private var formError: String?

  private var canSave: Bool {
    !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && !contactTypeId.isEmpty
      && !isSaving
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
          TextField("Ad", text: $firstName)
          TextField("Soyad", text: $lastName)

          Picker("Tür", selection: $contactTypeId) {
            Text("Seçilmedi").tag("")
            ForEach(vm.contactTypes) { type in
              Text(type.name).tag(type.id)
            }
          }

          TextField("Telefon", text: $phone)
            .keyboardType(.phonePad)
          TextField("E-posta", text: $email)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()

          Picker("Durum", selection: $status) {
            Text("Yok").tag(ContactStatus?.none)
            ForEach(ContactStatus.allCases) { s in
              Text(s.label).tag(ContactStatus?.some(s))
            }
          }

          TextField("Kaynak", text: $source)
          TextField("Notlar", text: $notes, axis: .vertical)
            .lineLimit(3...8)
        } footer: {
          if vm.contactTypes.isEmpty {
            Text("Kişi türleri yüklenemedi. Tür seçilmeden kayıt yapılamaz.")
          }
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
      .task {
        await vm.loadContactTypes()
        seed()
      }
    }
  }

  private var title: String {
    switch mode {
    case .create: "Yeni kişi"
    case .edit: "Kişiyi düzenle"
    }
  }

  private func seed() {
    guard case let .edit(contact) = mode else { return }
    firstName = contact.firstName
    lastName = contact.lastName ?? ""
    contactTypeId = contact.contactTypeId
    phone = contact.phone ?? ""
    email = contact.email ?? ""
    status = contact.status
    source = contact.source ?? ""
    notes = contact.notes ?? ""
  }

  private func save() async {
    let first = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !first.isEmpty, !contactTypeId.isEmpty else { return }

    isSaving = true
    formError = nil
    defer { isSaving = false }

    let lastVal = optionalTrimmed(lastName)
    let phoneVal = optionalTrimmed(phone)
    let emailVal = optionalTrimmed(email)
    let sourceVal = optionalTrimmed(source)
    let notesVal = optionalTrimmed(notes)

    let ok: Bool
    switch mode {
    case .create:
      ok = await vm.create(ContactCreate(
        contactTypeId: contactTypeId,
        titleId: nil,
        firstName: first,
        lastName: lastVal,
        phone: phoneVal,
        email: emailVal,
        notes: notesVal,
        status: status,
        source: sourceVal
      ))
    case let .edit(contact):
      ok = await vm.update(id: contact.id, ContactUpdate(
        contactTypeId: contactTypeId,
        titleId: nil,
        firstName: first,
        lastName: lastVal,
        phone: phoneVal,
        email: emailVal,
        notes: notesVal,
        status: status,
        source: sourceVal
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
