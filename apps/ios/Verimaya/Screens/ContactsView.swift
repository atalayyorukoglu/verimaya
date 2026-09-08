import SwiftUI

/*
 `apps/web/src/routes/contacts/+page.svelte` — mobil hâl, gerçek veriyle.

 Düzen mockup turundan değişmedi:
   • Başlık bloğu (`border-b pb-4`): "Kişiler" + sayaç satırı, altında tür
     süzgeci + "Çift kayıt tara" + "Yeni kişi".
   • Liste (`md:hidden`): `space-y-2`, satır `rounded-lg border bg-surface
     px-4 py-3`; ad (text-sm medium), telefon/e-posta (text-xs muted); sağda kalem.

 SAYAÇ: `store.totalCount` — sunucudan gelen `total_count`. Yüklü satır sayısı
 DEĞİL (arşiv dersi #1: panel "51 kişi" derken uygulama "1 kişi" diyordu).
 SÜZGEÇ: tür ve arama sunucuya `type_id` / `q` olarak gider (arşiv dersi #2).
*/
struct ContactsView: View {
    @Environment(\.palette) private var c

    @State private var store = ContactsStore()
    @State private var typeId = ""
    /// Varsayılan tip yalnız bir kez uygulanır (web'deki `defaultTypeApplied`).
    @State private var defaultTypeApplied = false
    @State private var searchText = ""
    /// Yazarken her tuşta istek atmamak için uygulanan arama ayrı tutulur.
    @State private var appliedSearch = ""
    @State private var formTarget: ContactFormTarget?
    @State private var duplicatesOpen = false

    private var filtered: Bool { !typeId.isEmpty || !appliedSearch.isEmpty }

    private var listDescription: String {
        guard let total = store.totalCount else { return S.Contacts.description }
        let count = String(total)
        return filtered
            ? vmFill(S.Contacts.totalFiltered, ["count": count])
            : vmFill(S.Contacts.total, ["count": count])
    }

    private var typeOptions: [(value: String, label: String)] {
        [(value: "", label: S.Contacts.filterTypeAll)]
            + store.contactTypes.map { (value: $0.id, label: $0.name) }
    }

    private var queryKey: String { "\(typeId)|\(appliedSearch)" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header

                if let error = store.errorMessage {
                    ErrorBanner(message: error) { reload() }
                } else if store.isLoading && !store.hasLoadedOnce {
                    LoadingRow(label: S.Contacts.loading)
                } else if store.items.isEmpty {
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
                        ForEach(store.items) { contact in
                            row(contact)
                        }
                    }

                    if store.canLoadMore {
                        LoadMoreRow(title: S.Contacts.loadMore, isLoading: store.isLoadingMore) {
                            Task {
                                await store.loadMore(
                                    typeId: typeId.isEmpty ? nil : typeId,
                                    query: appliedSearch.isEmpty ? nil : appliedSearch
                                )
                            }
                        }
                    }
                }
            }
            .padding(VMSpace.page)
        }
        .background(c.bg)
        .refreshable { await load() }
        .task {
            await store.loadTypesIfNeeded()
            if !defaultTypeApplied, let hasta = store.defaultTypeId {
                typeId = hasta
            }
            defaultTypeApplied = true
        }
        .task(id: queryKey) { await load() }
        .sheet(item: $formTarget) { target in
            ContactFormSheet(
                contact: target.contact,
                contactTypes: store.contactTypes,
                defaultTypeId: typeId.isEmpty ? (store.contactTypes.first?.id ?? "") : typeId,
                onSave: { body, existing in try await save(body, existing: existing) },
                onDelete: target.contact.map { existing in { try await delete(existing) } }
            )
            .environment(\.palette, c)
        }
        .sheet(isPresented: $duplicatesOpen) {
            DuplicatesSheet(contacts: store.items, open: $duplicatesOpen)
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
                    .accessibilityIdentifier("contacts.count")

                VMTextField(placeholder: S.Command.placeholder, text: $searchText)
                    .padding(.top, 14)
                    .onSubmit { appliedSearch = searchText.trimmed }
                    .submitLabel(.search)

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
                .padding(.top, VMSpace.sm)
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

    private func load() async {
        await store.reload(
            typeId: typeId.isEmpty ? nil : typeId,
            query: appliedSearch.isEmpty ? nil : appliedSearch
        )
    }

    private func reload() {
        Task { await load() }
    }

    private func save(_ body: ContactFormPayload, existing: Contact?) async throws {
        if let existing {
            try await store.update(existing.id, body.update)
        } else {
            try await store.create(body.create)
        }
        await load()
    }

    private func delete(_ contact: Contact) async throws {
        try await store.delete(contact.id)
        await load()
    }
}

/// `sheet(item:)` sarmalayıcısı — düzenleme ve yeni kayıt aynı formu kullanır.
struct ContactFormTarget: Identifiable {
    let contact: Contact?
    var id: String { contact?.id ?? "__new__" }
}

/// Formun ürettiği gövde. Create ve update şekilleri farklı olduğu için ikisi de
/// buradan türetilir.
struct ContactFormPayload {
    let firstName: String
    let lastName: String?
    let contactTypeId: String
    let phone: String?
    let email: String?
    let status: String?

    /// `display_name` YOK — sunucu ad+soyaddan türetir (arşiv dersi #3).
    var create: ContactCreate {
        ContactCreate(
            firstName: firstName,
            lastName: lastName,
            contactTypeId: contactTypeId,
            phone: phone,
            email: email,
            status: status
        )
    }

    var update: ContactUpdate {
        ContactUpdate(
            firstName: firstName,
            lastName: lastName,
            contactTypeId: contactTypeId,
            phone: phone,
            email: email,
            status: status
        )
    }
}

/// `ContactFormDialog.svelte` karşılığı.
struct ContactFormSheet: View {
    @Environment(\.palette) private var c
    @Environment(\.dismiss) private var dismiss

    let contact: Contact?
    let contactTypes: [ContactType]
    let defaultTypeId: String
    let onSave: (ContactFormPayload, Contact?) async throws -> Void
    let onDelete: (() async throws -> Void)?

    @State private var firstName = ""
    @State private var lastName = ""
    @State private var typeId = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var status = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    /// Hasta tipinde durum alanı görünür; diğer tiplerde durum yok (arşiv dersi #3).
    private var isPatientType: Bool {
        contactTypes.first { $0.id == typeId }?.name == "Hasta"
    }

    private var canSave: Bool {
        !firstName.trimmed.isEmpty && !typeId.isEmpty && !isSaving
    }

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
                    VMSelect(options: contactTypes.map { (value: $0.id, label: $0.name) },
                             selection: $typeId,
                             accessibilityLabel: "Tür")
                }
                if isPatientType {
                    labelled("Durum") {
                        VMSelect(options: statusOptions, selection: $status,
                                 accessibilityLabel: "Durum")
                    }
                }
                labelled(S.Contacts.colPhone) { VMTextField(placeholder: "+90…", text: $phone) }
                labelled(S.Contacts.colEmail) { VMTextField(placeholder: "ornek@firma.com", text: $email) }

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
        firstName = contact.firstName.isEmpty
            ? (contact.displayName.split(separator: " ").first.map(String.init) ?? "")
            : contact.firstName
        lastName = contact.lastName ?? ""
        typeId = contact.typeId
        phone = contact.phone ?? ""
        email = contact.email ?? ""
        status = contact.status?.rawValue ?? ""
    }

    private func submit() {
        let payload = ContactFormPayload(
            firstName: firstName.trimmed,
            lastName: lastName.trimmed.isEmpty ? nil : lastName.trimmed,
            contactTypeId: typeId,
            phone: phone.trimmed.isEmpty ? nil : phone.trimmed,
            email: email.trimmed.isEmpty ? nil : email.trimmed,
            status: isPatientType && !status.isEmpty ? status : nil
        )
        Task {
            isSaving = true
            errorMessage = nil
            do {
                try await onSave(payload, contact)
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

/// "Çift kayıt tara" — web'de `/contacts/duplicates`.
/// Yüklü sayfada ilk ad eşleşmesine bakar; sunucu tarafı tarama ayrı bir uçtur
/// ve bu turda bağlanmadı (bkz. README).
struct DuplicatesSheet: View {
    @Environment(\.palette) private var c

    let contacts: [Contact]
    @Binding var open: Bool

    private var pairs: [(Contact, Contact)] {
        var out: [(Contact, Contact)] = []
        guard contacts.count > 1 else { return out }
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
                Text("Yüklü kayıtlarda olası çift bulunamadı.")
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
