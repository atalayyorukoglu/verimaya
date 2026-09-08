import SwiftUI

/// Randevular — web panelindeki `/appointments` mobil görünümü.
///
/// Düzen: "Randevular" + "Bu ay · N randevu" + tarih aralığı ·
/// tür ve durum filtreleri + "+" · kart listesi (baş harf dairesi, ad,
/// durum rozeti + saat, "Klinik / Otel / Transfer" satırı).
struct AppointmentsView: View {
  @ObservedObject var period: PanelPeriod

  @StateObject private var vm = AppointmentsViewModel()
  @State private var showCreate = false
  @State private var editing: Appointment?

  /// Süzgeçler sunucuda uygulanıyor.
  private var rows: [Appointment] { vm.appointments }

  private var typeOptions: [(value: String, label: String)] {
    let names = Set(vm.knownTypes).sorted()
    return [(value: "", label: "Tüm türler")] + names.map { (value: $0, label: $0) }
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        if let message = vm.statusMessage {
          Text(message)
            .font(.footnote)
            .foregroundStyle(VerimayaTheme.danger)
        }

        PageTitle("Randevular", subtitle: "Bu ay · \(rows.count) randevu") {
          Text(period.rangeLabel)
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textMuted)
            .monospacedDigit()
        }

        HStack(spacing: 8) {
          SelectField(title: "Tüm türler", selection: $vm.appointmentType, options: typeOptions)
          SelectField(
            title: "Tüm durumlar",
            selection: $vm.status,
            options: [(value: "", label: "Tüm durumlar")]
              + AppointmentStatus.allCases.map { (value: $0.rawValue, label: $0.label) }
          )
          AddSquareButton { showCreate = true }
        }

        Divider().overlay(VerimayaTheme.border)

        if rows.isEmpty && !vm.isLoading {
          Text("Henüz randevu yok.")
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textMuted)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 40)
        } else {
          LazyVStack(spacing: 10) {
            ForEach(rows) { appointment in
              AppointmentCard(appointment: appointment) { editing = appointment }
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
    .sheet(isPresented: $showCreate) { AppointmentFormView(mode: .create, vm: vm) }
    .sheet(item: $editing) { a in AppointmentFormView(mode: .edit(a), vm: vm) }
    .task {
      applyPeriod()
      await vm.load(reset: true)
    }
    .onChange(of: period.month) { _, _ in
      applyPeriod()
      Task { await vm.load(reset: true) }
    }
    .onChange(of: vm.status) { _, _ in Task { await vm.load(reset: true) } }
    .onChange(of: vm.appointmentType) { _, _ in Task { await vm.load(reset: true) } }
  }

  private func applyPeriod() {
    vm.from = period.from
    vm.to = period.to
  }
}

private struct AppointmentCard: View {
  let appointment: Appointment
  let onEdit: () -> Void

  private var statusTone: Chip.Tone {
    switch appointment.status {
    case .completed: .success
    case .scheduled, .confirmed: .success
    case .inProgress: .info
    case .cancelled: .danger
    case .noShow: .warning
    }
  }

  /// Web'de rozetin içinde tür kısaltması + tarih + saat aralığı var.
  private var timeText: String {
    let start = DateFmt.dateTime(appointment.startsAt)
    guard let end = appointment.endsAt else { return start }
    return "\(start) - \(DateFmt.timeOnly(end))"
  }

  var body: some View {
    PanelCard {
      HStack(alignment: .top, spacing: 12) {
        AvatarCircle(name: appointment.contactDisplayName)

        VStack(alignment: .leading, spacing: 8) {
          Text(appointment.contactDisplayName)
            .font(.body.weight(.semibold))
            .foregroundStyle(VerimayaTheme.text)

          Chip(
            text: "\(appointment.appointmentType ?? appointment.status.label) · \(timeText)",
            tone: statusTone,
            showsDot: true
          )

          Text(logisticsLine)
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textMuted)
            .fixedSize(horizontal: false, vertical: true)
        }

        Spacer(minLength: 4)
        EditPencil(action: onEdit)
      }
    }
  }

  private var logisticsLine: String {
    "Klinik: \(appointment.clinicName.dashed), Otel: \(appointment.hotelName.dashed), "
      + "Transfer: \(appointment.transferNote.dashed)"
  }
}
