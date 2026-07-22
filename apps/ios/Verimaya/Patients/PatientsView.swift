import SwiftUI

struct PatientsView: View {
  @StateObject private var vm = PatientsViewModel()
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

        if vm.patients.isEmpty && !vm.isLoading {
          ContentUnavailableView(
            "Henüz hasta yok",
            systemImage: "person.2",
            description: Text("Yeni hasta eklemek için + butonunu kullanın.")
          )
        } else {
          List {
            ForEach(vm.patients) { patient in
              NavigationLink(value: patient.id) {
                PatientRow(patient: patient)
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
    .navigationTitle("Hastalar")
    .navigationDestination(for: String.self) { id in
      PatientDetailView(id: id, vm: vm)
    }
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          showCreate = true
        } label: {
          Image(systemName: "plus")
        }
        .accessibilityLabel("Yeni hasta")
      }
    }
    .sheet(isPresented: $showCreate) {
      PatientFormView(mode: .create, vm: vm)
    }
    .task {
      await vm.load(reset: true)
    }
  }
}

private struct PatientRow: View {
  let patient: Patient

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        Text(patient.fullName)
          .font(.body.weight(.medium))
          .foregroundStyle(VerimayaTheme.text)
        if let phone = patient.phone, !phone.isEmpty {
          Text(phone)
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textMuted)
        }
      }
      Spacer(minLength: 8)
      Text(patient.status.label)
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
