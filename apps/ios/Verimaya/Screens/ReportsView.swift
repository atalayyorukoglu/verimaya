import SwiftUI

/*
 `apps/web/src/routes/reports/+page.svelte` — mobil hâl, gerçek veriyle.

 Bütün sayılar `/v1/reports/…` uçlarından gelir; mockup turundaki istemci
 hesapları kaldırıldı. Dönem kabuk başlığından `from`/`to` olarak her uca geçer.

 Sekmeler: Özet / Kategori / Pazarlama (web'deki üç küçük düğme).
*/
struct ReportsView: View {
    @Environment(\.palette) private var c
    @Environment(AppState.self) private var app

    enum Tab: String, CaseIterable {
        case ozet, kategori, pazarlama

        var label: String {
            switch self {
            case .ozet: return S.Reports.tabSummary
            case .kategori: return S.Reports.tabCategory
            case .pazarlama: return S.Reports.tabMarketing
            }
        }

        var symbol: String {
            switch self {
            case .ozet: return "square.grid.2x2"
            case .kategori: return "folder"
            case .pazarlama: return "megaphone"
            }
        }
    }

    @State private var store = ReportsStore()
    @State private var tab: Tab = .ozet

    private var period: Period { app.reportsPeriod }
    private var baseCurrency: String { app.baseCurrency }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VMSpace.lg) {
                header

                if let error = store.errorMessage {
                    ErrorBanner(message: error) { reload() }
                } else if store.isLoading && !store.hasLoadedOnce {
                    LoadingRow(label: S.Reports.loading)
                } else {
                    switch tab {
                    case .ozet: summaryTab
                    case .kategori: categoryTab
                    case .pazarlama: marketingTab
                    }
                }
            }
            .padding(VMSpace.page)
        }
        .background(c.bg)
        .refreshable { await store.reload(from: period.apiFrom, to: period.apiTo) }
        .task(id: period.queryKey) {
            await store.reload(from: period.apiFrom, to: period.apiTo)
        }
    }

    // MARK: Başlık + sekmeler

    private var header: some View {
        HStack(alignment: .center, spacing: VMSpace.sm) {
            Text(S.Reports.title)
                .font(VMFont.semibold(16))
                .foregroundStyle(c.text)

            Spacer(minLength: 0)

            HStack(spacing: 6) {
                ForEach(Tab.allCases, id: \.rawValue) { item in
                    Button {
                        tab = item
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: item.symbol)
                                .font(.system(size: 11, weight: .medium))
                            Text(item.label)
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundStyle(tab == item ? c.onBrand : c.text)
                        .padding(.horizontal, 8)
                        .frame(height: 28)
                        .background(tab == item ? c.brand : .clear)
                        .clipShape(RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous)
                                .stroke(tab == item ? .clear : c.border, lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: Özet sekmesi

    private var summaryTab: some View {
        VStack(alignment: .leading, spacing: VMSpace.lg) {
            opsSection
            moneyTiles
            monthlyChart
            statusDistribution
            consistencySection
        }
    }

    /// "Operasyon" — `GET /v1/reports/appointment-metrics`.
    private var opsSection: some View {
        VMSection(title: S.Reports.Ops.title, subtitle: S.Reports.Ops.description) {
            if let ops = store.appointmentMetrics, ops.total > 0 {
                VStack(alignment: .leading, spacing: VMSpace.lg) {
                    LazyVGrid(columns: twoColumns, spacing: VMSpace.md) {
                        metricTile(S.Reports.Ops.total, "\(ops.total)", c.text)
                        metricTile(S.Reports.Ops.completion, VMFormat.percent(ops.completionRate), c.success)
                        metricTile(S.Reports.Ops.noShow, VMFormat.percent(ops.noShowRate), c.warning)
                        metricTile(S.Reports.Ops.cancellation, VMFormat.percent(ops.cancellationRate), c.danger)
                    }

                    breakdown(S.Reports.Ops.clinics, rows: ops.byClinic.map { row in
                        (row.clinicName, vmFill(S.Reports.Ops.clinicStats, [
                            "count": String(row.count),
                            "pct": VMFormat.percent(row.completionRate, digits: 0)
                        ]))
                    })

                    breakdown(S.Reports.Ops.types, rows: ops.byAppointmentType.map { row in
                        (row.appointmentType, "\(row.count) · \(VMFormat.percent(row.ratio, digits: 0))")
                    })

                    appointmentTrend
                }
            } else {
                Text(S.Reports.Ops.empty)
                    .font(VMFont.sm)
                    .foregroundStyle(c.textMuted)
            }
        }
    }

    private var appointmentTrend: some View {
        let buckets = store.appointmentBuckets()
        let maxValue = max(buckets.map(\.count).max() ?? 1, 1)

        return VStack(alignment: .leading, spacing: VMSpace.sm) {
            Text(S.Reports.Ops.monthly)
                .font(VMFont.semibold(12))
                .foregroundStyle(c.textMuted)
                .textCase(.uppercase)

            HStack(alignment: .bottom, spacing: VMSpace.sm) {
                ForEach(Array(buckets.enumerated()), id: \.offset) { _, bucket in
                    VStack(spacing: 4) {
                        Text(bucket.count > 0 ? "\(bucket.count)" : " ")
                            .font(.system(size: 10))
                            .foregroundStyle(c.textMuted)
                            .monospacedDigit()
                        Spacer(minLength: 0)
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(c.brand.opacity(0.8))
                            .frame(width: 14, height: max(2, 120 * CGFloat(bucket.count) / CGFloat(maxValue)))
                        Text(bucket.label)
                            .font(VMFont.xs)
                            .foregroundStyle(c.textMuted)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 160)
        }
    }

    /// Dört para kutusu — `GET /v1/reports/summary`.
    private var moneyTiles: some View {
        let summary = store.summary
        return LazyVGrid(columns: twoColumns, spacing: VMSpace.md) {
            moneyTile("\(S.Reports.totalIncome) (\(baseCurrency))", summary?.incomeBase ?? 0, c.success)
            moneyTile("\(S.Reports.totalExpense) (\(baseCurrency))", summary?.expenseBase ?? 0, c.text)
            moneyTile("\(S.Reports.net) (\(baseCurrency))", summary?.netBase ?? 0,
                      (summary?.netBase ?? 0) >= 0 ? c.success : c.danger)
            moneyTile("\(S.Reports.pending) (\(baseCurrency))", summary?.pendingBase ?? 0, c.warning)
        }
        .accessibilityIdentifier("reports.tiles")
    }

    /// "Aylık gelir / gider" — `GET /v1/reports/monthly` (son 6 ay).
    private var monthlyChart: some View {
        let buckets = store.monthlyBuckets()
        let maxValue = max(buckets.flatMap { [$0.income, $0.expense] }.max() ?? 1, 1)

        return VMSection(title: S.Reports.monthlyIoE, trailing: AnyView(
            HStack(spacing: VMSpace.md) {
                legend(S.Reports.income, c.success)
                legend(S.Reports.expense, c.border)
            }
        )) {
            HStack(alignment: .bottom, spacing: VMSpace.sm) {
                ForEach(Array(buckets.enumerated()), id: \.offset) { _, bucket in
                    VStack(spacing: 6) {
                        Spacer(minLength: 0)
                        HStack(alignment: .bottom, spacing: 3) {
                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .fill(c.success.opacity(0.8))
                                .frame(width: 12, height: max(2, 120 * CGFloat(bucket.income) / CGFloat(maxValue)))
                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .fill(c.border)
                                .frame(width: 12, height: max(2, 120 * CGFloat(bucket.expense) / CGFloat(maxValue)))
                        }
                        Text(bucket.label)
                            .font(VMFont.xs)
                            .foregroundStyle(c.textMuted)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 160)
        }
    }

    /// "Dosya durumu" — `GET /v1/reports/contact-distribution`.
    private var statusDistribution: some View {
        let rows = store.statusDistribution
        let total = max(rows.reduce(0) { $0 + $1.count }, 1)

        return VMSection(title: S.Reports.StatusDist.title) {
            if rows.isEmpty {
                Text(S.Reports.StatusDist.empty)
                    .font(VMFont.sm)
                    .foregroundStyle(c.textMuted)
            } else {
                VStack(spacing: VMSpace.md) {
                    ForEach(rows, id: \.status) { row in
                        let pct = Int((Double(row.count) / Double(total) * 100).rounded())
                        VStack(spacing: 4) {
                            HStack {
                                Text(row.status.label)
                                    .font(VMFont.xs)
                                    .foregroundStyle(c.text)
                                Spacer()
                                Text("\(row.count) · %\(pct)")
                                    .font(VMFont.xs)
                                    .foregroundStyle(c.textMuted)
                                    .monospacedDigit()
                            }
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(c.surface2)
                                    Capsule().fill(c.brand)
                                        .frame(width: geo.size.width * CGFloat(pct) / 100)
                                }
                            }
                            .frame(height: 6)
                        }
                    }
                }
            }
        }
    }

    /// "Tutarlılık uyarıları" — `GET /v1/reports/consistency`.
    /// Metin sunucudan değil, `message_key` ile KATALOGDAN çözülür.
    private var consistencySection: some View {
        let issues = store.consistency
        return VMSection(
            title: S.Reports.Consistency.title,
            subtitle: S.Reports.Consistency.description,
            trailing: issues.isEmpty ? nil : AnyView(
                StatusBadge(
                    label: vmFill(S.Reports.Consistency.badge, ["count": String(issues.count)]),
                    tone: .warning
                )
            )
        ) {
            if issues.isEmpty {
                Text(S.Reports.Consistency.clean)
                    .font(VMFont.sm)
                    .foregroundStyle(c.success)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(VMSpace.md)
                    .background(c.success.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous))
            } else {
                VStack(alignment: .leading, spacing: VMSpace.sm) {
                    ForEach(issues.prefix(8)) { issue in
                        HStack(alignment: .top, spacing: VMSpace.sm) {
                            Image(systemName: issue.severity == "error"
                                  ? "exclamationmark.octagon" : "exclamationmark.triangle")
                                .font(.system(size: 12))
                                .foregroundStyle(issue.severity == "error" ? c.danger : c.warning)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(issue.title?.trimmed.isEmpty == false ? issue.title! : "—")
                                    .font(VMFont.medium(13))
                                    .foregroundStyle(c.text)
                                    .lineLimit(1)
                                Text(issue.message)
                                    .font(VMFont.xs)
                                    .foregroundStyle(c.textMuted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    if issues.count > 8 {
                        Text("+ \(issues.count - 8) uyarı daha")
                            .font(VMFont.xs)
                            .foregroundStyle(c.textFaint)
                    }
                }
            }
        }
    }

    // MARK: Kategori sekmesi — `GET /v1/reports/by-category`

    private var categoryTab: some View {
        let summary = store.summary
        return VStack(alignment: .leading, spacing: VMSpace.lg) {
            HStack(spacing: VMSpace.md) {
                smallTile("\(S.Reports.income) (\(baseCurrency))",
                          VMFormat.money(summary?.incomeBase ?? 0, currency: baseCurrency), c.success)
                smallTile("\(S.Reports.expense) (\(baseCurrency))",
                          VMFormat.money(summary?.expenseBase ?? 0, currency: baseCurrency), c.text)
                smallTile(S.Reports.txLabel, "\(summary?.transactionCount ?? 0)", c.text)
            }

            Text(S.Reports.categoryReport)
                .font(VMFont.semibold(10))
                .foregroundStyle(c.textFaint)
                .textCase(.uppercase)

            if store.byCategory.isEmpty {
                Text(S.Reports.emptyPeriod)
                    .font(VMFont.sm)
                    .foregroundStyle(c.textMuted)
            } else {
                LazyVGrid(columns: twoColumns, spacing: VMSpace.md) {
                    ForEach(store.byCategory, id: \.categoryName) { row in
                        categoryCard(row)
                    }
                }
            }
        }
    }

    private func categoryCard(_ row: ReportByCategory.Row) -> some View {
        HStack(alignment: .top, spacing: VMSpace.md) {
            Image(systemName: "folder")
                .font(.system(size: 15))
                .foregroundStyle(row.netBase >= 0 ? c.success : c.danger)
                .frame(width: 40, height: 40)
                .background((row.netBase >= 0 ? c.success : c.danger).opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(row.categoryName)
                    .font(VMFont.semibold(14))
                    .foregroundStyle(c.text)
                    .lineLimit(2)
                Text(VMFormat.money(row.netBase, currency: baseCurrency))
                    .font(VMFont.semibold(16))
                    .foregroundStyle(row.netBase >= 0 ? c.success : c.danger)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(vmFill(S.Reports.txCount, ["count": String(row.transactionCount)]))
                    .font(VMFont.xs)
                    .foregroundStyle(c.textFaint)
            }
            Spacer(minLength: 0)
        }
        .padding(VMSpace.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .vmCard(c)
    }

    // MARK: Pazarlama sekmesi — `GET /v1/reports/marketing`

    private var marketingTab: some View {
        let marketing = store.marketing
        let missing = marketing?.realRoas == nil

        return VStack(alignment: .leading, spacing: VMSpace.lg) {
            if missing {
                VStack(alignment: .leading, spacing: 4) {
                    Text(marketing?.attributionMissing == true
                         ? "Atıf verisi eksik."
                         : S.Reports.Marketing.noData)
                        .font(VMFont.medium(14))
                        .foregroundStyle(c.text)
                    Text(S.Reports.Marketing.noDataHint)
                        .font(VMFont.sm)
                        .foregroundStyle(c.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(VMSpace.lg)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(c.warning.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous)
                        .stroke(c.warning.opacity(0.4), lineWidth: 1)
                )
            }

            LazyVGrid(columns: twoColumns, spacing: VMSpace.md) {
                moneyTile("\(S.Reports.Marketing.spend) (\(baseCurrency))",
                          marketing?.spendBase ?? 0, c.text)
                moneyTile("Gelir (\(baseCurrency))", marketing?.revenueBase ?? 0, c.success)
                metricTile("Lead", "\(marketing?.leadsCount ?? 0)", c.text)
                metricTile("Tedavi edilen", "\(marketing?.treatedCount ?? 0)", c.text)
            }
        }
    }

    // MARK: Ortak parçalar

    private var twoColumns: [GridItem] {
        [GridItem(.flexible(), spacing: VMSpace.md), GridItem(.flexible(), spacing: VMSpace.md)]
    }

    private func moneyTile(_ label: String, _ amount: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(VMFont.xs)
                .foregroundStyle(c.textMuted)
                .lineLimit(2)
            Text(VMFormat.money(amount, currency: baseCurrency))
                .font(VMFont.semibold(18))
                .foregroundStyle(color)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(VMSpace.lg)
        .vmCard(c)
    }

    private func metricTile(_ label: String, _ value: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(VMFont.xs)
                .foregroundStyle(c.textMuted)
            Text(value)
                .font(VMFont.semibold(18))
                .foregroundStyle(color)
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(VMSpace.md)
        .background(c.surface2.opacity(0.4))
        .clipShape(RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous)
                .stroke(c.border, lineWidth: 1)
        )
    }

    private func smallTile(_ label: String, _ value: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(VMFont.xs)
                .foregroundStyle(c.textMuted)
                .lineLimit(2)
            Text(value)
                .font(VMFont.semibold(16))
                .foregroundStyle(color)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(VMSpace.md)
        .vmCard(c)
    }

    private func breakdown(_ title: String, rows: [(String, String)]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(VMFont.semibold(12))
                .foregroundStyle(c.textMuted)
                .textCase(.uppercase)
                .padding(.bottom, VMSpace.sm)

            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                if index > 0 {
                    Rectangle().fill(c.border).frame(height: 1)
                }
                HStack(spacing: VMSpace.sm) {
                    Text(row.0)
                        .font(VMFont.sm)
                        .foregroundStyle(c.text)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Text(row.1)
                        .font(VMFont.xs)
                        .foregroundStyle(c.textMuted)
                        .monospacedDigit()
                }
                .padding(.vertical, VMSpace.sm)
            }
        }
    }

    private func legend(_ label: String, _ color: Color) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label)
                .font(VMFont.xs)
                .foregroundStyle(c.textMuted)
        }
    }

    private func reload() {
        Task { await store.reload(from: period.apiFrom, to: period.apiTo) }
    }
}
