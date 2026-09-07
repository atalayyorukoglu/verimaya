import SwiftUI

struct ContactsView: View {
  @StateObject private var vm = ContactsViewModel()
  @State private var showCreate = false

  var body: some View {
    ZStack {
      VerimayaTheme.bg.ignoresSafeArea()

      VStack(spacing: 0) {
        if let message = vm.statusMessage {
          Text(message)
            .font(.footnote)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(VerimayaTheme.danger)
        }

        if vm.contacts.isEmpty && !vm.isLoading {
          ContentUnavailableView(
            "Henüz kişi yok",
            systemImage: "person.2",
            description: Text("Yeni kişi eklemek için + butonunu kullanın.")
          )
        } else {
          List {
            ForEach(vm.contacts) { contact in
              NavigationLink(value: contact.id) {
                ContactRow(contact: contact)
              }
              .listRowBackground(VerimayaTheme.surface)
            }

            if vm.hasMore {
              HStack {
                Spacer()
                ProgressView()
                Spacer()
              }
              .listRowBackground(VerimayaTheme.bg)
              .onAppear {
                Task { await vm.loadMore() }
              }
            }
          }
          .listStyle(.plain)
          .scrollContentBackground(.hidden)
          .refreshable { await vm.refresh() }
        }
      }
    }
    .navigationTitle("Kişiler")
    .navigationDestination(for: String.self) { id in
      ContactDetailView(id: id, vm: vm)
    }
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          showCreate = true
        } label: {
          Image(systemName: "plus")
        }
        .accessibilityLabel("Yeni kişi")
      }
    }
    .sheet(isPresented: $showCreate) {
      ContactFormView(mode: .create, vm: vm)
    }
    .task {
      await vm.load(reset: true)
    }
  }
}

private struct ContactRow: View {
  let contact: Contact

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        Text(contact.displayName)
          .font(.body.weight(.medium))
          .foregroundStyle(VerimayaTheme.text)
        if let phone = contact.phone, !phone.isEmpty {
          Text(phone)
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textMuted)
        }
      }
      Spacer(minLength: 8)
      // Durum yalnız Hasta tipinde dolu; boşsa kişi türünü göster.
      Text(contact.status?.label ?? contact.contactTypeName)
        .font(.caption.weight(.medium))
        .foregroundStyle(VerimayaTheme.text)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(VerimayaTheme.brandSubtle)
        .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
    }
    .padding(.vertical, 2)
  }
}
