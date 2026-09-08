import SwiftUI

/*
 `apps/web/src/routes/appointments/+page.svelte` — mobil hâl.

 Web mobil düzeni:
   • Başlık bloğu (`border-b pb-4`): "Randevular"; altında iki yana yaslı satır —
     solda "{dönem} · {n} randevu", sağda "2026-09-01 > 2026-09-30".
   • Dönem sekmeleri `max-md:hidden` → mobilde YOK; dönem kabuk başlığında.
   • Süzgeç satırı: tür seçici + durum seçici + kare "+" düğmesi (mobilde
     etiket gizli, `max-sm:w-11`).
   • Kart (`rounded-xl border bg-surface p-4`, `space-y-2`):
       – 48px baş harf dairesi + isim (text-base semibold)
       – altında tip hapı: renkli nokta + tip adı + tarih·saat (tabular)
       – en altta tek satır: "Klinik: … , Otel: … , Transfer: …"
       – sağ üstte kalem düğmesi
   • Hap rengi `typePillClass`: RPT → danger, "devam" → turuncu,
     "yeni hasta" → yeşil, boşsa duruma göre.
*/
struct AppointmentsView: View {
    @Environment(\.palette) private var c
    @Environment(AppState.self) private var app

    @State private var appointments = MockData.appointments
    @State private var typeFilter = ""
    @State private var statusFilter = ""
    @State private var formTarget: AppointmentFormTarget?

    private var period: Period { app.appointmentsPeriod }

    private var filtered: [Appointment] {
        appointments
            .filter { period.contains($0.startsAt) }
            .filter { typeFilter.isEmpty || ($0.appointmentType ?? "") == typeFilter }
            .filter { statusFilter.isEmpty || $0.status.rawValue == statusFilter }
            .sorted { $0.startsAt < $1.startsAt }
    }

    private var typeOptions: [(value: String, label: String)] {
        [(value: "", label: S.Appointments.filterTypeAll)]
            + MockData.appointmentTypeNames.map { (value: $0, label: $0) }
    }

    private var statusOptions: [(value: String, label: String)] {
        [(value: "", label: S.Appointments.filterStatusAll)]
            + AppointmentStatus.allCases.map { (value: $0.rawValue, label: $0.label) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header

                if filtered.isEmpty {
                    EmptyStateCard {
                        Text(S.Appointments.emptyTitle)
                            .font(VMFont.medium(14))
                            .foregroundStyle(c.text)
                        Text(S.Appointments.emptyBody)
                            .font(VMFont.sm)
                            .foregroundStyle(c.textMuted)
                            .multilineTextAlignment(.center)
                        VMButton(title: S.Appointments.new, systemImage: "plus") {
                            formTarget = AppointmentFormTarget(appointment: nil)
                        }
                    }
                } else {
                    VStack(spacing: VMSpace.sm) {
                        ForEach(filtered) { appt in
                            card(appt)
                        }
                    }
                }
            }
            .padding(VMSpace.page)
        }
        .background(c.bg)
        .sheet(item: $formTarget) { target in
            AppointmentFormSheet(
                appointment: target.appointment,
                onSave: save,
                onDelete: target.appointment.map { existing in { delete(existing) } }
            )
            .environment(\.palette, c)
        }
    }

    private var header: some View {
        SectionHeaderBlock {
            VStack(alignment: .leading, spacing: 0) {
                Text(S.Appointments.title)
                    .font(VMFont.semibold(16))
                    .foregroundStyle(c.text)

                HStack(alignment: .firstTextBaseline, spacing: VMSpace.sm) {
                    Text(vmFill(S.Appointments.periodSummary, [
                        "period": period.summaryLabel,
                        "count": String(filtered.count)
                    ]))
                    .font(VMFont.sm)
                    .foregroundStyle(c.textMuted)
                    .lineLimit(1)

                    Spacer(minLength: 0)

                    Text(period.rangeText)
                        .font(VMFont.medium(14))
                        .foregroundStyle(c.textMuted)
                        .monospacedDigit()
                        .lineLimit(1)
                }
                .padding(.top, 2)

                HStack(spacing: VMSpace.sm) {
                    VMSelect(options: typeOptions, selection: $typeFilter,
                             accessibilityLabel: S.Appointments.filterTypeAria)
                    VMSelect(options: statusOptions, selection: $statusFilter,
                             accessibilityLabel: S.Appointments.filterStatusAria)
                    VMButton(title: "", systemImage: "plus") {
                        formTarget = AppointmentFormTarget(appointment: nil)
                    }
                    .accessibilityLabel(S.Appointments.new)
                }
                .padding(.top, 14)
            }
        }
    }

    private func card(_ appt: Appointment) -> some View {
        VStack(alignment: .leading, spacing: VMSpace.md) {
            HStack(alignment: .top, spacing: VMSpace.md) {
                Text(VMFormat.initials(appt.contactDisplayName))
                    .font(VMFont.semibold(14))
                    .foregroundStyle(c.text)
                    .frame(width: 48, height: 48)
                    .background(c.surface2)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(c.border, lineWidth: 1))

                VStack(alignment: .leading, spacing: 6) {
                    Text(appt.contactDisplayName)
                        .font(VMFont.semibold(16))
                        .foregroundStyle(c.text)
                        .lineLimit(1)

                    typePill(appt)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Button {
                    formTarget = AppointmentFormTarget(appointment: appt)
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

            logisticsLine(appt)
        }
        .padding(VMSpace.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .vmCard(c, radius: VMRadius.cardLarge)
    }

    /// `typeLabel` + `scheduleLabel` + `typePillClass` karşılığı.
    private func typePill(_ appt: Appointment) -> some View {
        let tone = pillTone(appt)
        return HStack(spacing: 6) {
            Circle()
                .fill(tone.dot)
                .frame(width: 8, height: 8)
            // Web'de tip adı `truncate`, tarih `shrink-0`: daralınca TİP kısalır, saat değil.
            Text(typeLabel(appt))
                .font(VMFont.semibold(12))
                .foregroundStyle(tone.text)
                .lineLimit(1)
                .truncationMode(.tail)
            Text(scheduleLabel(appt))
                .font(VMFont.xs)
                .foregroundStyle(tone.text.opacity(0.9))
                .monospacedDigit()
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(tone.background)
        .clipShape(RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous)
                .stroke(tone.border, lineWidth: 1)
        )
    }

    private func logisticsLine(_ appt: Appointment) -> some View {
        let parts: [(String, String)] = [
            (S.Appointments.cardClinic, appt.clinicName?.trimmed.isEmpty == false ? appt.clinicName! : "—"),
            (S.Appointments.cardHotel, appt.hotelName?.trimmed.isEmpty == false ? appt.hotelName! : "—"),
            (S.Appointments.cardTransfer, transferLabel(appt))
        ]

        var text = Text("")
        for (index, part) in parts.enumerated() {
            if index > 0 {
                text = text + Text(", ").foregroundColor(c.textMuted)
            }
            text = text
                + Text("\(part.0):").font(VMFont.medium(14)).foregroundColor(c.text)
                + Text(" \(part.1)").font(VMFont.sm).foregroundColor(c.textMuted)
        }
        return text
            .font(VMFont.sm)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func typeLabel(_ appt: Appointment) -> String {
        let raw = appt.appointmentType?.trimmed ?? ""
        return raw.isEmpty ? appt.status.label : raw
    }

    private func scheduleLabel(_ appt: Appointment) -> String {
        let date = VMFormat.day(appt.startsAt)
        let start = VMFormat.time(appt.startsAt)
        if let end = appt.endsAt {
            return "\(date) · \(start) - \(VMFormat.time(end))"
        }
        return "\(date) · \(start)"
    }

    private func transferLabel(_ appt: Appointment) -> String {
        guard let note = appt.transferNote?.trimmed, !note.isEmpty else { return "—" }
        return note.split(separator: "\n").first.map(String.init) ?? "—"
    }

    private struct PillTone {
        let text: Color
        let background: Color
        let border: Color
        let dot: Color
    }

    private func pillTone(_ appt: Appointment) -> PillTone {
        let raw = (appt.appointmentType?.trimmed ?? "").lowercased(with: VMFormat.locale)
        if raw == "rpt" {
            return PillTone(text: c.danger, background: c.danger.opacity(0.10),
                            border: c.danger.opacity(0.25), dot: c.danger)
        }
        if raw.contains("devam") {
            let orange = Color(hex: "#C2410C")
            return PillTone(text: orange, background: orange.opacity(0.10),
                            border: orange.opacity(0.25), dot: Color(hex: "#F97316"))
        }
        if raw.contains("yeni hasta") {
            let emerald = Color(hex: "#047857")
            return PillTone(text: emerald, background: emerald.opacity(0.10),
                            border: emerald.opacity(0.25), dot: emerald)
        }
        if !raw.isEmpty {
            return PillTone(text: c.textMuted, background: c.surface2, border: c.border, dot: c.textFaint)
        }
        switch appt.status {
        case .completed:
            let emerald = Color(hex: "#047857")
            return PillTone(text: emerald, background: emerald.opacity(0.10),
                            border: emerald.opacity(0.25), dot: emerald)
        case .cancelled, .no_show:
            return PillTone(text: c.danger, background: c.danger.opacity(0.10),
                            border: c.danger.opacity(0.25), dot: c.danger)
        case .confirmed, .in_progress:
            return PillTone(text: c.brandText, background: c.brandSubtle,
                            border: c.brand.opacity(0.3), dot: c.brand)
        case .scheduled:
            return PillTone(text: c.textMuted, background: c.surface2, border: c.border, dot: c.textFaint)
        }
    }

    private func save(_ appointment: Appointment) {
        if let index = appointments.firstIndex(where: { $0.id == appointment.id }) {
            appointments[index] = appointment
        } else {
            appointments.append(appointment)
        }
        formTarget = nil
    }

    private func delete(_ appointment: Appointment) {
        appointments.removeAll { $0.id == appointment.id }
        formTarget = nil
    }
}

struct AppointmentFormTarget: Identifiable {
    let appointment: Appointment?
    var id: String { appointment?.id ?? "__new__" }
}

/// `AppointmentFormDialog.svelte` karşılığı.
struct AppointmentFormSheet: View {
    @Environment(\.palette) private var c
    @Environment(\.dismiss) private var dismiss

    let appointment: Appointment?
    let onSave: (Appointment) -> Void
    let onDelete: (() -> Void)?

    @State private var contactId = "c-01"
    @State private var startsAt = Date()
    @State private var status = AppointmentStatus.scheduled.rawValue
    @State private var type = "Yeni Hasta"
    @State private var clinic = ""
    @State private var hotel = ""
    @State private var transfer = ""

    private var patientOptions: [(value: String, label: String)] {
        MockData.contacts
            .filter { $0.typeId == "ct-hasta" }
            .map { (value: $0.id, label: $0.displayName) }
    }

    private var clinicOptions: [(value: String, label: String)] {
        [(value: "", label: "—")]
            + MockData.contacts.filter { $0.typeId == "ct-klinik" }
                .map { (value: $0.displayName, label: $0.displayName) }
    }

    private var hotelOptions: [(value: String, label: String)] {
        [(value: "", label: "—")]
            + MockData.contacts.filter { $0.typeId == "ct-otel" }
                .map { (value: $0.displayName, label: $0.displayName) }
    }

    private var transferOptions: [(value: String, label: String)] {
        [(value: "", label: "—")]
            + MockData.contacts.filter { $0.typeId == "ct-transfer" }
                .map { (value: $0.displayName, label: $0.displayName) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VMSpace.md) {
                Text(appointment == nil ? S.Appointments.new : S.Common.edit)
                    .font(VMFont.semibold(18))
                    .foregroundStyle(c.text)

                labelled("Hasta") {
                    VMSelect(options: patientOptions, selection: $contactId, accessibilityLabel: "Hasta")
                }
                labelled("Tarih ve saat") {
                    HStack {
                        DatePicker("", selection: $startsAt)
                            .labelsHidden()
                            .environment(\.locale, VMFormat.locale)
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .frame(height: VMSize.control)
                    .vmCard(c, radius: VMRadius.control)
                }
                labelled("Tür") {
                    VMSelect(options: MockData.appointmentTypeNames.map { (value: $0, label: $0) },
                             selection: $type, accessibilityLabel: "Tür")
                }
                labelled("Durum") {
                    VMSelect(options: AppointmentStatus.allCases.map { (value: $0.rawValue, label: $0.label) },
                             selection: $status, accessibilityLabel: "Durum")
                }
                labelled(S.Appointments.cardClinic) {
                    VMSelect(options: clinicOptions, selection: $clinic, accessibilityLabel: S.Appointments.cardClinic)
                }
                labelled(S.Appointments.cardHotel) {
                    VMSelect(options: hotelOptions, selection: $hotel, accessibilityLabel: S.Appointments.cardHotel)
                }
                labelled(S.Appointments.cardTransfer) {
                    VMSelect(options: transferOptions, selection: $transfer, accessibilityLabel: S.Appointments.cardTransfer)
                }

                HStack(spacing: VMSpace.sm) {
                    VMButton(title: "Kaydet", fullWidth: true) { submit() }
                    VMButton(title: S.Common.cancel, variant: .outline, fullWidth: true) { dismiss() }
                }
                .padding(.top, VMSpace.sm)

                if let onDelete {
                    Button("Sil", role: .destructive) { onDelete() }
                        .font(VMFont.sm)
                        .foregroundStyle(c.danger)
                        .frame(maxWidth: .infinity)
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
        guard let appointment else {
            startsAt = Date()
            return
        }
        contactId = appointment.contactId
        startsAt = appointment.startsAt
        status = appointment.status.rawValue
        type = appointment.appointmentType ?? "Yeni Hasta"
        clinic = appointment.clinicName ?? ""
        hotel = appointment.hotelName ?? ""
        transfer = appointment.transferNote ?? ""
    }

    private func submit() {
        let contactName = MockData.contacts.first { $0.id == contactId }?.displayName ?? "—"
        let record = Appointment(
            id: appointment?.id ?? "a-\(UUID().uuidString.prefix(6))",
            contactId: contactId,
            contactDisplayName: contactName,
            startsAt: startsAt,
            endsAt: appointment?.endsAt,
            status: AppointmentStatus(rawValue: status) ?? .scheduled,
            appointmentType: type,
            clinicName: clinic.isEmpty ? nil : clinic,
            hotelName: hotel.isEmpty ? nil : hotel,
            transferNote: transfer.isEmpty ? nil : transfer,
            doctorName: appointment?.doctorName
        )
        onSave(record)
        dismiss()
    }
}
