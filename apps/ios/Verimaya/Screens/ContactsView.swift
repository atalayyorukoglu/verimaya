import SwiftUI

/*
 `apps/web/src/routes/contacts/+page.svelte` — mobil hâl.

 Web mobil düzeni:
   • Başlık bloğu: `h1` (text-base semibold) + sayaç satırı (`{count} kişi`),
     altında tür süzgeci + "Çift kayıt tara" + "Yeni kişi"; blok `border-b pb-4`.
   • Liste (`md:hidden`): `space-y-2`, her satır `rounded-lg border bg-surface
     px-4 py-3` — ad (text-sm medium), telefon ve e-posta (text-xs muted).
     Sağda kalem düğmesi (düzenle) → `ContactFormDialog`.
   • Tablo hâli yalnız `md:` — mobilde yok, buraya da alınmadı.

 Sayaç: web'de sunucudan `total_count` gelir (arşiv dersi #1). Burada ağ yok;
 sayaç veri kümesinin TAMAMINI sayar (yüklü sayfayı değil) ve süzgeçle değişir.

 Kayıtlar bu ekranda yerel `@State` üzerinde tutulur: ekleme/düzenleme gerçekten
 listeyi değiştirir. Ağ katmanı gelince bu state repository ile değişir.
*/
struct ContactsView: View {
    @Environment(\.palette) private var c

    @State private var contacts = MockData.contacts
    /// Web'de varsayılan "Hasta" tipi seçili gelir (`defaultTypeApplied`).
    @State private var typeId = "ct-hasta"
    @State private var formTarget: ContactFormTarget?
    @State private var duplicatesOpen = false

    private var filtered: [Contact] {
        guard !typeId.isEmpty else { return contacts }
        return contacts.filter { $0.typeId == typeId }
    }

    private var listDescription: String {
        let count = String(filtered.count)
        return typeId.isEmpty
            ? vmFill(S.Contacts.total, ["count": count])
            : vmFill(S.Contacts.totalFiltered, ["count": count])
    }

    private var typeOptions: [(value: String, label: String)] {
        [(value: "", label: S.Contacts.filterTypeAll)]
            + MockData.contactTypes.map { (value: $0.id, label: $0.name) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header

                if filtered.isEmpty {
                    EmptyStateCard {
                        Text(S.Contacts.emptyTitle)
                            .font(VMFont.medium(14))
                            .foregroundStyle(c.text)
                        VMButton(title: S.Contacts.emptyCta) {
                            formTarget = ContactFormTarget(contact: nil)
                        }
                    }
                } else {
                    VStack(spacing: VMSpace.sm) {
                        ForEach(filtered) { contact in
                            row(contact)
                        }
                    }
                }
            }
            .padding(VMSpace.page)
        }
        .background(c.bg)
        .sheet(item: $formTarget) { target in
            ContactFormSheet(
                contact: target.contact,
                defaultTypeId: typeId.isEmpty ? "ct-hasta" : typeId,
                onSave: save,
                onDelete: target.contact.map { existing in { delete(existing) } }
            )
            .environment(\.palette, c)
        }
        .sheet(isPresented: $duplicatesOpen) {
            DuplicatesSheet(contacts: contacts, open: $duplicatesOpen)
                .environment(\.palette, c)
        }
    }

    private var header: some View {
        SectionHeaderBlock {
            VStack(alignment: .leading, spacing: 0) {
                Text(S.Contacts.title)
                    .font(VMFont.semibold(16))
                    .foregroundStyle(c.text)
                Text(listDescription)
                    .font(VMFont.sm)
                    .foregroundStyle(c.textMuted)
                    .padding(.top, 2)

                HStack(spacing: VMSpace.sm) {
                    VMSelect(options: typeOptions, selection: $typeId,
                             accessibilityLabel: S.Contacts.filterTypeAria)
                        .frame(maxWidth: 150)
                    Spacer(minLength: 0)
                    VMButton(title: "", systemImage: "person.2.badge.gearshape", variant: .outline) {
                        duplicatesOpen = true
                    }
                    .accessibilityLabel(S.Contacts.duplicates)
                    VMButton(title: S.Contacts.new) {
                        formTarget = ContactFormTarget(contact: nil)
                    }
                }
                .padding(.top, 14)
            }
        }
    }

    private func row(_ contact: Contact) -> some View {
        HStack(alignment: .top, spacing: VMSpace.md) {
            VStack(alignment: .leading, spacing: 2) {
                Text(contact.displayName)
                    .font(VMFont.medium(14))
                    .foregroundStyle(c.text)
                Text(contact.phone ?? "—")
                    .font(VMFont.xs)
                    .foregroundStyle(c.textMuted)
                    .monospacedDigit()
                Text(contact.email ?? "—")
                    .font(VMFont.xs)
                    .foregroundStyle(c.textMuted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                formTarget = ContactFormTarget(contact: contact)
            } label: {
                Image(systemName: "pencil")
                    .font(.system(size: 15))
                    .foregroundStyle(c.textMuted)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(S.Common.edit)
        }
        .padding(.horizontal, VMSpace.lg)
        .padding(.vertical, VMSpace.md)
        .vmCard(c)
    }

    private func save(_ contact: Contact) {
        if let index = contacts.firstIndex(where: { $0.id == contact.id }) {
            contacts[index] = contact
        } else {
            contacts.insert(contact, at: 0)
        }
        formTarget = nil
    }

    private func delete(_ contact: Contact) {
        contacts.removeAll { $0.id == contact.id }
        formTarget = nil
    }
}

/// `sheet(item:)` için sarmalayıcı — düzenleme ve yeni kayıt aynı formu kullanır.
struct ContactFormTarget: Identifiable {
    let contact: Contact?
    var id: String { contact?.id ?? "__new__" }
}

/// `ContactFormDialog.svelte` karşılığı.
/// Arşiv dersi #3: `display_name` ad+soyaddan TÜRETİLİR, ayrı alan olarak girilmez;
/// `contact_type_id` zorunlu; durum yalnız Hasta tipinde anlamlı.
struct ContactFormSheet: View {
    @Environment(\.palette) private var c
    @Environment(\.dismiss) private var dismiss

    let contact: Contact?
    let defaultTypeId: String
    let onSave: (Contact) -> Void
    let onDelete: (() -> Void)?

    @State private var firstName = ""
    @State private var lastName = ""
    @State private var typeId = "ct-hasta"
    @State private var phone = ""
    @State private var email = ""
    @State private var status = ""

    private var isPatient: Bool { typeId == "ct-hasta" }
    private var canSave: Bool { !firstName.trimmed.isEmpty }

    private var statusOptions: [(value: String, label: String)] {
        [(value: "", label: "Durum yok")]
            + ContactStatus.allCases.map { (value: $0.rawValue, label: $0.label) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VMSpace.md) {
                Text(contact == nil ? S.Contacts.new : S.Common.edit)
                    .font(VMFont.semibold(18))
                    .foregroundStyle(c.text)

                labelled("Ad") { VMTextField(placeholder: "Ad", text: $firstName) }
                labelled("Soyad") { VMTextField(placeholder: "Soyad", text: $lastName) }
                labelled("Tür") {
                    VMSelect(options: MockData.contactTypes.map { (value: $0.id, label: $0.name) },
                             selection: $typeId,
                             accessibilityLabel: "Tür")
                }
                if isPatient {
                    labelled("Durum") {
                        VMSelect(options: statusOptions, selection: $status,
                                 accessibilityLabel: "Durum")
                    }
                }
                labelled(S.Contacts.colPhone) { VMTextField(placeholder: "+90…", text: $phone) }
                labelled(S.Contacts.colEmail) { VMTextField(placeholder: "ornek@firma.com", text: $email) }

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
                        .padding(.top, VMSpace.xs)
                }
            }
            .padding(VMSpace.lg)
        }
        .background(c.bg)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .onAppear(perform: hydrate)
    }

    private func labelled<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(VMFont.xs)
                .foregroundStyle(c.textMuted)
            content()
        }
    }

    private func hydrate() {
        guard let contact else {
            typeId = defaultTypeId
            return
        }
        let parts = contact.displayName.split(separator: " ", maxSplits: 1).map(String.init)
        firstName = parts.first ?? ""
        lastName = parts.count > 1 ? parts[1] : ""
        typeId = contact.typeId
        phone = contact.phone ?? ""
        email = contact.email ?? ""
        status = contact.status?.rawValue ?? ""
    }

    private func submit() {
        let display = [firstName.trimmed, lastName.trimmed]
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        let record = Contact(
            id: contact?.id ?? "c-\(UUID().uuidString.prefix(6))",
            displayName: display,
            typeId: typeId,
            phone: phone.trimmed.isEmpty ? nil : phone.trimmed,
            email: email.trimmed.isEmpty ? nil : email.trimmed,
            status: isPatient ? ContactStatus(rawValue: status) : nil
        )
        onSave(record)
        dismiss()
    }
}

/// "Çift kayıt tara" — web'de `/contacts/duplicates`.
/// Mockup: ilk ad eşleşmesine göre olası çiftleri listeler.
struct DuplicatesSheet: View {
    @Environment(\.palette) private var c

    let contacts: [Contact]
    @Binding var open: Bool

    private var pairs: [(Contact, Contact)] {
        var out: [(Contact, Contact)] = []
        for i in contacts.indices {
            for j in contacts.index(after: i)..<contacts.endIndex {
                let a = contacts[i].displayName.lowercased(with: VMFormat.locale)
                let b = contacts[j].displayName.lowercased(with: VMFormat.locale)
                guard let aFirst = a.split(separator: " ").first,
                      let bFirst = b.split(separator: " ").first else { continue }
                if aFirst == bFirst { out.append((contacts[i], contacts[j])) }
            }
        }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: VMSpace.md) {
            Text(S.Contacts.duplicates)
                .font(VMFont.semibold(18))
                .foregroundStyle(c.text)

            if pairs.isEmpty {
                Text("Olası çift kayıt bulunamadı.")
                    .font(VMFont.sm)
                    .foregroundStyle(c.textMuted)
            } else {
                ForEach(Array(pairs.enumerated()), id: \.offset) { _, pair in
                    HStack {
                        Text(pair.0.displayName)
                            .font(VMFont.sm)
                            .foregroundStyle(c.text)
                        Image(systemName: "arrow.left.arrow.right")
                            .font(.system(size: 11))
                            .foregroundStyle(c.textFaint)
                        Text(pair.1.displayName)
                            .font(VMFont.sm)
                            .foregroundStyle(c.text)
                    }
                    .padding(VMSpace.md)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .vmCard(c)
                }
            }

            Spacer(minLength: 0)

            VMButton(title: S.Common.close, variant: .outline, fullWidth: true) { open = false }
        }
        .padding(VMSpace.lg)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(c.bg)
        .presentationDetents([.height(300)])
        .presentationDragIndicator(.visible)
    }
}
