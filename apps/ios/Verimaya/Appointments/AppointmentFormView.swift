import SwiftUI

struct AppointmentFormView: View {
  enum Mode {
    case create
    case edit(Appointment)
  }

  let mode: Mode
  @ObservedObject var vm: AppointmentsViewModel

  @Environment(\.dismiss) private var dismiss

  @State private var patients: [Patient] = []
  @State private var isLoadingPatients = false
  @State private var patientId = ""
  @State private var startsAt = Date()
  @State private var hasEnd = false
  @State private var endsAt = Date().addingTimeInterval(3600)
  @State private var status: AppointmentStatus = .scheduled
  @State private var title = ""
  @State private var appointmentType = ""
  @State private var clinicName = ""
  @State private var hotelName = ""
  @State private var transferNote = ""
  @State private var notes = ""
  @State private var isSaving = false
  @State private var formError: String?
  @State private var confirmCancel = false

  private static let isoOut: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()

  private var canSave: Bool {
    guard !isSaving else { return false }
    switch mode {
    case .create:
      return !patientId.isEmpty && !patients.isEmpty
    case .edit:
      return true
    }
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
          patientSection
        }

        Section {
          DatePicker("Başlangıç", selection: $startsAt, displayedComponents: [.date, .hourAndMinute])
            .environment(\.locale, Locale(identifier: "tr_TR"))
          Toggle("Bitiş saati", isOn: $hasEnd)
          if hasEnd {
            DatePicker("Bitiş", selection: $endsAt, displayedComponents: [.date, .hourAndMinute])
              .environment(\.locale, Locale(identifier: "tr_TR"))
          }
          Picker("Durum", selection: $status) {
            ForEach(AppointmentStatus.allCases) { s in
              Text(s.label).tag(s)
            }
          }
        }

        Section {
          TextField("Başlık", text: $title)
          TextField("Randevu tipi", text: $appointmentType)
          TextField("Klinik", text: $clinicName)
          TextField("Otel", text: $hotelName)
          TextField("Transfer notu", text: $transferNote)
          TextField("Notlar", text: $notes, axis: .vertical)
            .lineLimit(3...8)
        }

        if case .edit = mode {
          Section {
            Button("Randevuyu iptal et", role: .destructive) {
              confirmCancel = true
            }
            .disabled(isSaving || status == .cancelled)
          }
        }
      }
      .scrollContentBackground(.hidden)
      .background(VerimayaTheme.bg)
      .navigationTitle(navTitle)
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
      .confirmationDialog(
        "Randevuyu iptal etmek istediğinize emin misiniz?",
        isPresented: $confirmCancel,
        titleVisibility: .visible
      ) {
        Button("İptal et", role: .destructive) {
          Task { await cancelAppointment() }
        }
        Button("Vazgeç", role: .cancel) {}
      }
      .task { await bootstrap() }
    }
  }

  @ViewBuilder
  private var patientSection: some View {
    switch mode {
    case .create:
      if isLoadingPatients {
        HStack {
          Text("Hastalar yükleniyor…")
            .foregroundStyle(VerimayaTheme.textMuted)
          Spacer()
          ProgressView()
        }
      } else if patients.isEmpty {
        Text("Önce Hastalar sekmesinden hasta ekleyin")
          .font(.footnote)
          .foregroundStyle(VerimayaTheme.danger)
      } else {
        Picker("Hasta", selection: $patientId) {
          Text("Seçin").tag("")
          ForEach(patients) { p in
            Text(p.fullName).tag(p.id)
          }
        }
      }
    case let .edit(appointment):
      LabeledContent("Hasta") {
        Text(appointment.patientDisplayName)
          .foregroundStyle(VerimayaTheme.text)
      }
    }
  }

  private var navTitle: String {
    switch mode {
    case .create: "Yeni randevu"
    case .edit: "Randevuyu düzenle"
    }
  }

  private func bootstrap() async {
    seed()
    guard case .create = mode else { return }
    isLoadingPatients = true
    defer { isLoadingPatients = false }
    do {
      let page = try await APIClient.shared.listPatients(limit: 100)
      patients = page.items
      if patientId.isEmpty, let first = patients.first {
        patientId = first.id
      }
    } catch {
      formError = (error as? APIError)?.errorDescription ?? error.localizedDescription
    }
  }

  private func seed() {
    guard case let .edit(appointment) = mode else { return }
    patientId = appointment.patientId
    startsAt = DateFmt.parse(appointment.startsAt) ?? Date()
    if let end = appointment.endsAt, let parsed = DateFmt.parse(end) {
      hasEnd = true
      endsAt = parsed
    } else {
      hasEnd = false
      endsAt = startsAt.addingTimeInterval(3600)
    }
    status = appointment.status
    title = appointment.title ?? ""
    appointmentType = appointment.appointmentType ?? ""
    clinicName = appointment.clinicName ?? ""
    hotelName = appointment.hotelName ?? ""
    transferNote = appointment.transferNote ?? ""
    notes = appointment.notes ?? ""
  }

  private func save() async {
    guard canSave else { return }
    isSaving = true
    formError = nil
    defer { isSaving = false }

    let startsISO = Self.isoOut.string(from: startsAt)
    let endsISO = hasEnd ? Self.isoOut.string(from: endsAt) : nil

    let ok: Bool
    switch mode {
    case .create:
      ok = await vm.create(AppointmentCreate(
        patientId: patientId,
        title: optionalTrimmed(title),
        appointmentType: optionalTrimmed(appointmentType),
        status: status,
        startsAt: startsISO,
        endsAt: endsISO,
        clinicName: optionalTrimmed(clinicName),
        hotelName: optionalTrimmed(hotelName),
        transferNote: optionalTrimmed(transferNote),
        notes: optionalTrimmed(notes)
      ))
    case let .edit(appointment):
      ok = await vm.update(id: appointment.id, AppointmentUpdate(
        title: optionalTrimmed(title),
        appointmentType: optionalTrimmed(appointmentType),
        status: status,
        startsAt: startsISO,
        endsAt: endsISO,
        clinicName: optionalTrimmed(clinicName),
        hotelName: optionalTrimmed(hotelName),
        transferNote: optionalTrimmed(transferNote),
        notes: optionalTrimmed(notes)
      ))
    }

    if ok {
      dismiss()
    } else {
      formError = vm.statusMessage ?? "Kayıt başarısız."
    }
  }

  private func cancelAppointment() async {
    guard case let .edit(appointment) = mode else { return }
    isSaving = true
    formError = nil
    defer { isSaving = false }
    let ok = await vm.cancel(id: appointment.id)
    if ok {
      dismiss()
    } else {
      formError = vm.statusMessage ?? "İptal başarısız."
    }
  }

  private func optionalTrimmed(_ s: String) -> String? {
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    return t.isEmpty ? nil : t
  }
}
