import SwiftUI

/*
 `apps/web/src/routes/appointments/+page.svelte` — mobil hâl, gerçek veriyle.

 Düzen mockup turundan değişmedi (kart `rounded-xl`, 48px baş harf dairesi,
 renkli tip hapı, lojistik tek satır, sağ üstte kalem).

 SAYAÇ: randevu zarfı `total_count` TAŞIMAZ; sayaç `status_counts` toplamıdır —
 web de aynısını yapıyor. Yüklü satır sayısı değil.
 SÜZGEÇ: tür/durum/dönem sunucuya `appointment_type` / `status` / `from` / `to`
 olarak gider. Dönem kabuk başlığındaki denetimden gelir.
*/
struct AppointmentsView: View {
    @Environment(\.palette) private var c
    @Environment(AppState.self) private var app

    @State private var store = AppointmentsStore()
    @State private var typeFilter = ""
    @State private var statusFilter = ""
    @State private var formTarget: AppointmentFormTarget?

    private var period: Period { app.appointmentsPeriod }

    private var filters: AppointmentsStore.Filters {
        AppointmentsStore.Filters(
            type: typeFilter.isEmpty ? nil : typeFilter,
            status: statusFilter.isEmpty ? nil : statusFilter,
            from: period.apiFrom,
            to: period.apiTo
        )
    }

    private var typeOptions: [(value: String, label: String)] {
        [(value: "", label: S.Appointments.filterTypeAll)]
            + store.appointmentTypes.map { (value: $0, label: $0) }
    }

    private var statusOptions: [(value: String, label: String)] {
        [(value: "", label: S.Appointments.filterStatusAll)]
            + AppointmentStatus.allCases.map { (value: $0.rawValue, label: $0.label) }
    }

    private var summaryText: String {
        guard let total = store.totalCount else { return period.summaryLabel }
        return vmFill(S.Appointments.periodSummary, [
            "period": period.summaryLabel,
            "count": String(total)
        ])
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header

                if let error = store.errorMessage {
                    ErrorBanner(message: error) { reload() }
                } else if store.isLoading && !store.hasLoadedOnce {
                    LoadingRow(label: S.Appointments.loading)
                } else if store.items.isEmpty {
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
                        ForEach(store.items) { appt in
                            card(appt)
                        }
                    }

                    if store.canLoadMore {
                        LoadMoreRow(title: S.Appointments.loadMore, isLoading: store.isLoadingMore) {
                            Task { await store.loadMore(filters) }
                        }
                    }
                }
            }
            .padding(VMSpace.page)
        }
        .background(c.bg)
        .refreshable { await store.reload(filters) }
        .task { await store.loadTypesIfNeeded() }
        .task(id: filters.key) { await store.reload(filters) }
        .sheet(item: $formTarget) { target in
            AppointmentFormSheet(
                appointment: target.appointment,
                appointmentTypes: store.appointmentTypes,
                onSave: { body, existing in try await save(body, existing: existing) },
                onDelete: target.appointment.map { existing in { try await delete(existing) } }
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
                    Text(summaryText)
                        .font(VMFont.sm)
                        .foregroundStyle(c.textMuted)
                        .lineLimit(1)
                        .accessibilityIdentifier("appointments.count")

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

    private func reload() {
        Task { await store.reload(filters) }
    }

    private func save(_ body: AppointmentWrite, existing: Appointment?) async throws {
        if let existing {
            try await store.update(existing.id, body)
        } else {
            try await store.create(body)
        }
        await store.reload(filters)
    }

    private func delete(_ appointment: Appointment) async throws {
        try await store.delete(appointment.id)
        await store.reload(filters)
    }
}

struct AppointmentFormTarget: Identifiable {
    let appointment: Appointment?
    var id: String { appointment?.id ?? "__new__" }
}

/// `AppointmentFormDialog.svelte` karşılığı.
/// Hasta ve klinik/otel/transfer listeleri sunucudan (`/v1/contacts`) yüklenir.
struct AppointmentFormSheet: View {
    @Environment(\.palette) private var c
    @Environment(\.dismiss) private var dismiss

    let appointment: Appointment?
    let appointmentTypes: [String]
    let onSave: (AppointmentWrite, Appointment?) async throws -> Void
    let onDelete: (() async throws -> Void)?

    @State private var contacts: [Contact] = []
    @State private var contactTypes: [ContactType] = []
    @State private var contactId = ""
    @State private var startsAt = Date()
    @State private var status = AppointmentStatus.scheduled.rawValue
    @State private var type = ""
    @State private var clinic = ""
    @State private var hotel = ""
    @State private var transfer = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    private func contacts(ofType name: String) -> [(value: String, label: String)] {
        let typeId = contactTypes.first { $0.name == name }?.id
        let rows = contacts.filter { $0.typeId == typeId }
        return [(value: "", label: "—")] + rows.map { (value: $0.displayName, label: $0.displayName) }
    }

    private var patientOptions: [(value: String, label: String)] {
        let typeId = contactTypes.first { $0.name == "Hasta" }?.id
        let rows = typeId == nil ? contacts : contacts.filter { $0.typeId == typeId }
        return rows.map { (value: $0.id, label: $0.displayName) }
    }

    private var canSave: Bool { !contactId.isEmpty && !isSaving }

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
                    VMSelect(options: [(value: "", label: "—")]
                                + appointmentTypes.map { (value: $0, label: $0) },
                             selection: $type, accessibilityLabel: "Tür")
                }
                labelled("Durum") {
                    VMSelect(options: AppointmentStatus.allCases.map { (value: $0.rawValue, label: $0.label) },
                             selection: $status, accessibilityLabel: "Durum")
                }
                labelled(S.Appointments.cardClinic) {
                    VMSelect(options: contacts(ofType: "Klinik"), selection: $clinic,
                             accessibilityLabel: S.Appointments.cardClinic)
                }
                labelled(S.Appointments.cardHotel) {
                    VMSelect(options: contacts(ofType: "Otel"), selection: $hotel,
                             accessibilityLabel: S.Appointments.cardHotel)
                }
                labelled(S.Appointments.cardTransfer) {
                    VMSelect(options: contacts(ofType: "Transfer"), selection: $transfer,
                             accessibilityLabel: S.Appointments.cardTransfer)
                }

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
        .task { await loadPickers() }
    }

    private func labelled<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(VMFont.xs)
                .foregroundStyle(c.textMuted)
            content()
        }
    }

    /// Seçici listeleri sunucudan. `limit` yüksek: bu bir seçicidir, sayfalama yok.
    private func loadPickers() async {
        async let contactsTask = try? await APIClient.shared.listContacts(limit: 100)
        async let typesTask = try? await APIClient.shared.listContactTypes()
        contacts = (await contactsTask)?.items ?? []
        contactTypes = (await typesTask) ?? []
        hydrate()
    }

    private func hydrate() {
        guard let appointment else {
            contactId = patientOptions.first?.value ?? ""
            type = appointmentTypes.first ?? ""
            startsAt = Date()
            return
        }
        contactId = appointment.contactId
        startsAt = appointment.startsAt
        status = appointment.status.rawValue
        type = appointment.appointmentType ?? ""
        clinic = appointment.clinicName ?? ""
        hotel = appointment.hotelName ?? ""
        transfer = appointment.transferNote ?? ""
    }

    private func submit() {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        let body = AppointmentWrite(
            contactId: contactId,
            startsAt: formatter.string(from: startsAt),
            endsAt: appointment?.endsAt.map { formatter.string(from: $0) },
            status: status,
            appointmentType: type.isEmpty ? nil : type,
            clinicName: clinic.isEmpty ? nil : clinic,
            hotelName: hotel.isEmpty ? nil : hotel,
            transferNote: transfer.isEmpty ? nil : transfer
        )
        Task {
            isSaving = true
            errorMessage = nil
            do {
                try await onSave(body, appointment)
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
