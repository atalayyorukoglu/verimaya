import SwiftUI

/// Kişiler — web panelindeki `/contacts` mobil görünümünün karşılığı.
///
/// Düzen: başlık + "N kişi" · tür filtresi + "Yeni kişi" · kart listesi
/// (ad, telefon, e-posta, sağda kalem).
struct ContactsView: View {
  @StateObject private var vm = ContactsViewModel()
  @State private var showCreate = false
  @State private var editing: Contact?
  @State private var typeFilter = ""

  private var filtered: [Contact] {
    typeFilter.isEmpty ? vm.contacts : vm.contacts.filter { $0.contactTypeId == typeFilter }
  }

  private var typeOptions: [(value: String, label: String)] {
    [(value: "", label: "Tüm türler")] + vm.contactTypes.map { (value: $0.id, label: $0.name) }
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        if let message = vm.statusMessage {
          Text(message)
            .font(.footnote)
            .foregroundStyle(VerimayaTheme.danger)
        }

        PageTitle("Kişiler", subtitle: subtitle)

        HStack(spacing: 8) {
          SelectField(title: "Tüm türler", selection: $typeFilter, options: typeOptions)
          BrandButton(title: "Yeni kişi") { showCreate = true }
        }

        Divider().overlay(VerimayaTheme.border)

        if filtered.isEmpty && !vm.isLoading {
          Text("Henüz kişi yok.")
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textMuted)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 40)
        } else {
          LazyVStack(spacing: 10) {
            ForEach(filtered) { contact in
              ContactCard(contact: contact) { editing = contact }
            }

            if vm.hasMore {
              ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .onAppear { Task { await vm.loadMore() } }
            }
          }
        }
      }
      .padding(VerimayaUI.pagePadding)
      .padding(.bottom, 72)
    }
    .background(VerimayaTheme.bg)
    .refreshable { await vm.refresh() }
    .sheet(isPresented: $showCreate) { ContactFormView(mode: .create, vm: vm) }
    .sheet(item: $editing) { c in ContactFormView(mode: .edit(c), vm: vm) }
    .task {
      await vm.load(reset: true)
      await vm.loadContactTypes()
    }
  }

  private var subtitle: String {
    let count = filtered.count
    return typeFilter.isEmpty ? "\(count) kişi" : "\(count) kişi (filtreli)"
  }
}

/// Web'deki kişi kartı: ad · telefon · e-posta, sağda kalem.
/// Eksik alanlar uzun tire ile gösterilir — panelde de öyle.
private struct ContactCard: View {
  let contact: Contact
  let onEdit: () -> Void

  var body: some View {
    PanelCard {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 3) {
          Text(contact.displayName)
            .font(.body.weight(.semibold))
            .foregroundStyle(VerimayaTheme.text)
          Text(contact.phone.dashed)
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textMuted)
          Text(contact.email.dashed)
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textMuted)
            .lineLimit(1)
        }
        Spacer(minLength: 8)
        EditPencil(action: onEdit)
      }
    }
  }
}
