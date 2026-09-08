import SwiftUI

/*
 `apps/web/src/lib/components/HeaderPeriodPicker.svelte` karşılığı.

 Kabuk başlığındaki kompakt denetim: `‹ Eylül 2026 ˅ ›`.
 - Kap: `h-11` (44), `rounded-[8px]`, `border`, `bg-surface`.
 - Oklar 44 genişlikte; etiket ortada, iki yanında ayraç çizgisi.
 - Oklar dönemi AY AY ilerletir (hangi dönemde olursa olsun sonuç bir aydır).
 - Etikete basınca panel: "Bu aya git" / başlangıç / bitiş / tüm zamanlar.

 Web'de panel `portal` ile body'ye taşınıyordu (backdrop-filter sorunu);
 iOS'ta karşılığı `sheet`.
*/
struct PeriodPickerBar: View {
    @Environment(\.palette) private var c
    @Binding var period: Period

    @State private var panelOpen = false

    var body: some View {
        HStack(spacing: 0) {
            arrowButton(symbol: "chevron.left", label: S.Reports.Period.prevMonth) {
                period.stepMonth(-1)
            }

            Rectangle().fill(c.border).frame(width: 1)

            Button {
                panelOpen = true
            } label: {
                HStack(spacing: 4) {
                    Text(period.headerLabel)
                        .font(VMFont.medium(14))
                        .foregroundStyle(c.text)
                        .lineLimit(1)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(c.textMuted)
                }
                .padding(.horizontal, 8)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Rectangle().fill(c.border).frame(width: 1)

            arrowButton(symbol: "chevron.right", label: S.Reports.Period.nextMonth) {
                period.stepMonth(1)
            }
        }
        .frame(height: VMSize.control)
        .background(c.surface)
        .clipShape(RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous)
                .stroke(c.border, lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel(S.Reports.Period.label)
        .sheet(isPresented: $panelOpen) {
            PeriodPanel(period: $period, open: $panelOpen)
                .environment(\.palette, c)
        }
    }

    private func arrowButton(symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(c.textMuted)
                .frame(width: 44, height: VMSize.control)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Etikete basınca açılan panel — web'deki `fixed` panelin karşılığı.
private struct PeriodPanel: View {
    @Environment(\.palette) private var c
    @Binding var period: Period
    @Binding var open: Bool

    @State private var draftFrom = Date()
    @State private var draftTo = Date()

    var body: some View {
        VStack(spacing: VMSpace.md) {
            Button {
                period.key = .buAy
                open = false
            } label: {
                Text(S.Reports.Period.goThisMonth)
                    .font(VMFont.medium(14))
                    .foregroundStyle(c.brandText)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(c.brandSubtle)
                    .clipShape(RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous)
                            .stroke(c.brand.opacity(0.4), lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: VMSpace.sm) {
                dateRow(S.Reports.Period.from, selection: $draftFrom)
                dateRow(S.Reports.Period.to, selection: $draftTo)
            }

            Button {
                period.key = .tum
                open = false
            } label: {
                Text(S.Reports.Period.allTime)
                    .font(VMFont.sm)
                    .foregroundStyle(c.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .overlay(
                        RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous)
                            .stroke(c.border, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)

            HStack(spacing: VMSpace.sm) {
                VMButton(title: S.Common.apply, variant: .primary, fullWidth: true) {
                    period.customFrom = draftFrom
                    period.customTo = draftTo
                    period.key = .ozel
                    open = false
                }
                VMButton(title: S.Common.cancel, variant: .outline, fullWidth: true) {
                    open = false
                }
            }

            Spacer(minLength: 0)
        }
        .padding(VMSpace.lg)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(c.bg)
        .presentationDetents([.height(320)])
        .presentationDragIndicator(.visible)
        .onAppear {
            let fallback = period.range ?? (Period.monthStart(offset: 0), Period.monthEnd(offset: 0))
            draftFrom = fallback.from
            draftTo = fallback.to
        }
    }

    private func dateRow(_ label: String, selection: Binding<Date>) -> some View {
        HStack {
            Text(label)
                .font(VMFont.xs)
                .foregroundStyle(c.textMuted)
            Spacer()
            DatePicker("", selection: selection, displayedComponents: .date)
                .labelsHidden()
                .environment(\.locale, VMFormat.locale)
        }
        .padding(.horizontal, 12)
        .frame(height: VMSize.control)
        .background(c.surface)
        .clipShape(RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous)
                .stroke(c.border, lineWidth: 1)
        )
    }
}

/// Randevular/Raporlar sayfasındaki sekmeli dönem seçici
/// (`PeriodSelector.svelte`; web'de `max-md:hidden` — mobilde gizli).
/// Mockup'ta gizli tutuldu: dönem denetimi kabuk başlığında.
struct PeriodTabs: View {
    @Environment(\.palette) private var c
    @Binding var period: Period

    var body: some View {
        HStack(spacing: 2) {
            ForEach(PeriodKey.allCases, id: \.rawValue) { key in
                Button {
                    period.key = key
                    if key == .ozel {
                        period.customFrom = Period.monthStart(offset: 0)
                        period.customTo = Period.monthEnd(offset: 0)
                    }
                } label: {
                    Text(key.label)
                        .font(VMFont.semibold(12))
                        .foregroundStyle(period.key == key ? c.text : c.textFaint)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(period.key == key ? c.surface : .clear)
                        .clipShape(RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous)
                                .stroke(period.key == key ? c.border : .clear, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(2)
        .background(c.surface2)
        .clipShape(RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous)
                .stroke(c.border, lineWidth: 1)
        )
    }
}
