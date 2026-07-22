import SwiftUI

struct AppointmentsView: View {
  @StateObject private var vm = AppointmentsViewModel()
  @State private var showCreate = false
  @State private var editing: Appointment?

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

        if vm.appointments.isEmpty && !vm.isLoading {
          ContentUnavailableView(
            "Henüz randevu yok",
            systemImage: "calendar",
            description: Text("Yeni randevu eklemek için + butonunu kullanın.")
          )
        } else {
          List {
            ForEach(vm.appointments) { appointment in
              Button {
                editing = appointment
              } label: {
                AppointmentRow(appointment: appointment)
              }
              .buttonStyle(.plain)
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
    .navigationTitle("Randevular")
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          showCreate = true
        } label: {
          Image(systemName: "plus")
        }
        .accessibilityLabel("Yeni randevu")
      }
    }
    .sheet(isPresented: $showCreate) {
      AppointmentFormView(mode: .create, vm: vm)
    }
    .sheet(item: $editing) { appointment in
      AppointmentFormView(mode: .edit(appointment), vm: vm)
    }
    .task {
      await vm.load(reset: true)
    }
  }
}

private struct AppointmentRow: View {
  let appointment: Appointment

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        Text(appointment.patientDisplayName)
          .font(.body.weight(.semibold))
          .foregroundStyle(VerimayaTheme.text)
        Text(DateFmt.dateTime(appointment.startsAt))
          .font(.subheadline)
          .foregroundStyle(VerimayaTheme.textMuted)
        if let clinic = appointment.clinicName, !clinic.isEmpty {
          Text(clinic)
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textMuted)
        }
      }
      Spacer(minLength: 8)
      Text(appointment.status.label)
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
