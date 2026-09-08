import SwiftUI

/*
 `apps/web/src/routes/reports/+page.svelte` — mobil hâl.

 Web düzeni (özet sekmesi):
   • `PageHeader` "Raporlar"; eylem olarak üç küçük sekme düğmesi
     (Özet / Kategori / Pazarlama) — `h-6 text-xs`, aktif olan dolu.
   • `PeriodSelector` (mobilde dönem kabuk başlığında).
   • "Operasyon" kartı: 2 sütun (mobil) dört kutu — toplam randevu, tamamlanma,
     no-show, iptal; altında klinik ve randevu tipi kırılımları; altında aylık
     randevu trendi (6 kova, 180px yükseklik).
   • Dört para kutusu: toplam gelir / gider / net / bekleyen tahsilat
     (`grid-cols-2` mobilde).
   • "Aylık gelir / gider" çift çubuk grafik (6 ay).
   • "Dosya durumu" — kişi durum dağılımı, yüzde çubuğu.
   • "Tutarlılık uyarıları".
 Kategori sekmesi: üç küçük kutu (gelir/gider/işlem) + kategori kartları ızgarası.

 Bütün sayılar `MockData` üzerinden HESAPLANIR — sabit yazılmadı, dönem
 değişince gerçekten değişirler.
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

    @State private var tab: Tab = .ozet
    /// Kategori sekmesinde kırılım (web'deki `drill`).
    @State private var drillCategory: String?

    private var period: Period { app.reportsPeriod }

    private var transactions: [Transaction] {
        MockData.transactions.filter { period.contains($0.occurredOn) }
    }

    private var appointments: [Appointment] {
        MockData.appointments.filter { period.contains($0.startsAt) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VMSpace.lg) {
                header

                switch tab {
                case .ozet: summaryTab
                case .kategori: categoryTab
                case .pazarlama: marketingTab
                }
            }
            .padding(VMSpace.page)
        }
        .background(c.bg)
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
                        drillCategory = nil
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

    private var opsSection: some View {
        let total = appointments.count
        let completed = appointments.filter { $0.status == .completed }.count
        let noShow = appointments.filter { $0.status == .no_show }.count
        let cancelled = appointments.filter { $0.status == .cancelled }.count
        let ratio: (Int) -> Double = { total == 0 ? 0 : Double($0) / Double(total) }

        return VMSection(title: S.Reports.Ops.title, subtitle: S.Reports.Ops.description) {
            if total == 0 {
                Text(S.Reports.Ops.empty)
                    .font(VMFont.sm)
                    .foregroundStyle(c.textMuted)
            } else {
                VStack(alignment: .leading, spacing: VMSpace.lg) {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: VMSpace.md),
                                        GridItem(.flexible(), spacing: VMSpace.md)],
                              spacing: VMSpace.md) {
                        metricTile(S.Reports.Ops.total, "\(total)", c.text)
                        metricTile(S.Reports.Ops.completion, VMFormat.percent(ratio(completed)), c.success)
                        metricTile(S.Reports.Ops.noShow, VMFormat.percent(ratio(noShow)), c.warning)
                        metricTile(S.Reports.Ops.cancellation, VMFormat.percent(ratio(cancelled)), c.danger)
                    }

                    breakdown(S.Reports.Ops.clinics, rows: clinicRows)
                    breakdown(S.Reports.Ops.types, rows: typeRows)
                    appointmentTrend
                }
            }
        }
    }

    private var clinicRows: [(String, String)] {
        let grouped = Dictionary(grouping: appointments) { $0.clinicName ?? "—" }
        return grouped
            .sorted { $0.value.count > $1.value.count }
            .map { name, list in
                let done = list.filter { $0.status == .completed }.count
                let pct = VMFormat.percent(Double(done) / Double(list.count), digits: 0)
                return (name, vmFill(S.Reports.Ops.clinicStats,
                                     ["count": String(list.count), "pct": pct]))
            }
    }

    private var typeRows: [(String, String)] {
        let grouped = Dictionary(grouping: appointments) { $0.appointmentType ?? "—" }
        let total = max(appointments.count, 1)
        return grouped
            .sorted { $0.value.count > $1.value.count }
            .map { name, list in
                let pct = VMFormat.percent(Double(list.count) / Double(total), digits: 0)
                return (name, "\(list.count) · \(pct)")
            }
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

    /// Son 6 ayın randevu sayısı — web'deki 6 kovalı çubuk grafik.
    private var appointmentTrend: some View {
        let buckets = monthBuckets { month in
            MockData.appointments.filter { MockData.calendar.isDate($0.startsAt, equalTo: month, toGranularity: .month) }.count
        }
        let maxValue = max(buckets.map(\.value).max() ?? 1, 1)

        return VStack(alignment: .leading, spacing: VMSpace.sm) {
            Text(S.Reports.Ops.monthly)
                .font(VMFont.semibold(12))
                .foregroundStyle(c.textMuted)
                .textCase(.uppercase)

            HStack(alignment: .bottom, spacing: VMSpace.sm) {
                ForEach(buckets, id: \.label) { bucket in
                    VStack(spacing: 4) {
                        Text(bucket.value > 0 ? "\(bucket.value)" : " ")
                            .font(.system(size: 10))
                            .foregroundStyle(c.textMuted)
                            .monospacedDigit()
                        Spacer(minLength: 0)
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(c.brand.opacity(0.8))
                            .frame(width: 14, height: max(2, 120 * CGFloat(bucket.value) / CGFloat(maxValue)))
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

    private var moneyTiles: some View {
        let income = transactions.filter { $0.kind == .income }
            .reduce(0) { $0 + ($1.amountBase ?? 0) }
        let expense = transactions.filter { $0.kind == .expense }
            .reduce(0) { $0 + ($1.amountBase ?? 0) }
        let pending = transactions
            .filter { $0.kind == .income && $0.status != .paid }
            .reduce(0) { $0 + ($1.amountBase ?? 0) }

        return LazyVGrid(columns: [GridItem(.flexible(), spacing: VMSpace.md),
                                   GridItem(.flexible(), spacing: VMSpace.md)],
                         spacing: VMSpace.md) {
            moneyTile("\(S.Reports.totalIncome) (\(MockData.baseCurrency))", income, c.success)
            moneyTile("\(S.Reports.totalExpense) (\(MockData.baseCurrency))", expense, c.text)
            moneyTile("\(S.Reports.net) (\(MockData.baseCurrency))", income - expense,
                      income - expense >= 0 ? c.success : c.danger)
            moneyTile("\(S.Reports.pending) (\(MockData.baseCurrency))", pending, c.warning)
        }
    }

    private func moneyTile(_ label: String, _ amount: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(VMFont.xs)
                .foregroundStyle(c.textMuted)
                .lineLimit(2)
            Text(VMFormat.money(amount, currency: MockData.baseCurrency))
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

    /// "Aylık gelir / gider" — yan yana iki çubuk, altı ay.
    private var monthlyChart: some View {
        let incomeBuckets = monthBuckets { month in
            MockData.transactions
                .filter { $0.kind == .income && MockData.calendar.isDate($0.occurredOn, equalTo: month, toGranularity: .month) }
                .reduce(0) { $0 + ($1.amountBase ?? 0) }
        }
        let expenseBuckets = monthBuckets { month in
            MockData.transactions
                .filter { $0.kind == .expense && MockData.calendar.isDate($0.occurredOn, equalTo: month, toGranularity: .month) }
                .reduce(0) { $0 + ($1.amountBase ?? 0) }
        }
        let maxValue = max(
            (incomeBuckets.map(\.value) + expenseBuckets.map(\.value)).max() ?? 1,
            1
        )

        return VMSection(title: S.Reports.monthlyIoE, trailing: AnyView(
            HStack(spacing: VMSpace.md) {
                legend(S.Reports.income, c.success)
                legend(S.Reports.expense, c.border)
            }
        )) {
            HStack(alignment: .bottom, spacing: VMSpace.sm) {
                ForEach(Array(incomeBuckets.enumerated()), id: \.offset) { index, bucket in
                    VStack(spacing: 6) {
                        Spacer(minLength: 0)
                        HStack(alignment: .bottom, spacing: 3) {
                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .fill(c.success.opacity(0.8))
                                .frame(width: 12, height: max(2, 120 * CGFloat(bucket.value) / CGFloat(maxValue)))
                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .fill(c.border)
                                .frame(width: 12, height: max(2, 120 * CGFloat(expenseBuckets[index].value) / CGFloat(maxValue)))
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

    private func legend(_ label: String, _ color: Color) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label)
                .font(VMFont.xs)
                .foregroundStyle(c.textMuted)
        }
    }

    /// "Dosya durumu" — kişi durumlarının dağılımı, yüzde çubuğu.
    private var statusDistribution: some View {
        let patients = MockData.contacts.filter { $0.status != nil }
        let grouped = Dictionary(grouping: patients) { $0.status! }
        let total = max(patients.count, 1)

        return VMSection(title: S.Reports.StatusDist.title) {
            if patients.isEmpty {
                Text(S.Reports.StatusDist.empty)
                    .font(VMFont.sm)
                    .foregroundStyle(c.textMuted)
            } else {
                VStack(spacing: VMSpace.md) {
                    ForEach(ContactStatus.allCases, id: \.rawValue) { status in
                        let count = grouped[status]?.count ?? 0
                        if count > 0 {
                            let pct = Int((Double(count) / Double(total) * 100).rounded())
                            VStack(spacing: 4) {
                                HStack {
                                    Text(status.label)
                                        .font(VMFont.xs)
                                        .foregroundStyle(c.text)
                                    Spacer()
                                    Text("\(count) · %\(pct)")
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
    }

    private var consistencySection: some View {
        VMSection(title: S.Reports.Consistency.title, subtitle: S.Reports.Consistency.description,
                  trailing: AnyView(
                      StatusBadge(label: vmFill(S.Reports.Consistency.badge,
                                                ["count": String(MockData.consistencyIssues.count)]),
                                  tone: .warning)
                  )) {
            VStack(alignment: .leading, spacing: VMSpace.sm) {
                ForEach(MockData.consistencyIssues, id: \.self) { issue in
                    HStack(alignment: .top, spacing: VMSpace.sm) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 12))
                            .foregroundStyle(c.warning)
                        Text(issue)
                            .font(VMFont.sm)
                            .foregroundStyle(c.textMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    // MARK: Kategori sekmesi

    private var categoryTab: some View {
        let income = transactions.filter { $0.kind == .income }.reduce(0) { $0 + ($1.amountBase ?? 0) }
        let expense = transactions.filter { $0.kind == .expense }.reduce(0) { $0 + ($1.amountBase ?? 0) }

        return VStack(alignment: .leading, spacing: VMSpace.lg) {
            HStack(spacing: VMSpace.md) {
                smallTile("\(S.Reports.income) (\(MockData.baseCurrency))",
                          VMFormat.money(income, currency: MockData.baseCurrency), c.success)
                smallTile("\(S.Reports.expense) (\(MockData.baseCurrency))",
                          VMFormat.money(expense, currency: MockData.baseCurrency), c.text)
                smallTile(S.Reports.txLabel, "\(transactions.count)", c.text)
            }

            if let drillCategory {
                categoryDrill(drillCategory)
            } else {
                Text(S.Reports.categoryReport)
                    .font(VMFont.semibold(10))
                    .foregroundStyle(c.textFaint)
                    .textCase(.uppercase)

                if categoryTotals.isEmpty {
                    Text(S.Reports.emptyPeriod)
                        .font(VMFont.sm)
                        .foregroundStyle(c.textMuted)
                } else {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: VMSpace.md),
                                        GridItem(.flexible(), spacing: VMSpace.md)],
                              spacing: VMSpace.md) {
                        ForEach(categoryTotals, id: \.label) { row in
                            Button {
                                self.drillCategory = row.label
                            } label: {
                                categoryCard(row)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private struct CategoryTotal {
        let label: String
        let net: Int
        let count: Int
    }

    private var categoryTotals: [CategoryTotal] {
        let grouped = Dictionary(grouping: transactions) { $0.category ?? "—" }
        return grouped
            .map { label, list in
                let net = list.reduce(0) { sum, tx in
                    sum + (tx.kind == .income ? (tx.amountBase ?? 0) : -(tx.amountBase ?? 0))
                }
                return CategoryTotal(label: label, net: net, count: list.count)
            }
            .sorted { abs($0.net) > abs($1.net) }
    }

    private func categoryCard(_ row: CategoryTotal) -> some View {
        HStack(alignment: .top, spacing: VMSpace.md) {
            Image(systemName: "folder")
                .font(.system(size: 15))
                .foregroundStyle(row.net >= 0 ? c.success : c.danger)
                .frame(width: 40, height: 40)
                .background((row.net >= 0 ? c.success : c.danger).opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(row.label)
                    .font(VMFont.semibold(14))
                    .foregroundStyle(c.text)
                    .lineLimit(2)
                Text(VMFormat.money(row.net, currency: MockData.baseCurrency))
                    .font(VMFont.semibold(16))
                    .foregroundStyle(row.net >= 0 ? c.success : c.danger)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(vmFill(S.Reports.txCount, ["count": String(row.count)]))
                    .font(VMFont.xs)
                    .foregroundStyle(c.textFaint)
            }
            Spacer(minLength: 0)
        }
        .padding(VMSpace.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .vmCard(c)
    }

    private func categoryDrill(_ label: String) -> some View {
        let rows = transactions.filter { ($0.category ?? "—") == label }
        return VStack(alignment: .leading, spacing: VMSpace.md) {
            Button {
                drillCategory = nil
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.left")
                        .font(.system(size: 13, weight: .medium))
                    Text(S.Reports.categoriesBack)
                        .font(VMFont.medium(14))
                }
                .foregroundStyle(c.text)
                .padding(.horizontal, 12)
                .frame(height: VMSize.control)
                .vmCard(c, radius: VMRadius.control)
            }
            .buttonStyle(.plain)

            Text(label)
                .font(VMFont.semibold(16))
                .foregroundStyle(c.text)

            ForEach(rows) { tx in
                HStack(spacing: VMSpace.sm) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tx.derivedLabel)
                            .font(VMFont.sm)
                            .foregroundStyle(c.text)
                            .lineLimit(1)
                        Text(VMFormat.day(tx.occurredOn))
                            .font(VMFont.xs)
                            .foregroundStyle(c.textFaint)
                    }
                    Spacer(minLength: 0)
                    Text((tx.kind == .expense ? "−" : "") + VMFormat.money(tx.amount, currency: tx.currency))
                        .font(VMFont.medium(14))
                        .monospacedDigit()
                        .foregroundStyle(tx.kind == .income ? c.success : c.text)
                }
                .padding(VMSpace.md)
                .frame(maxWidth: .infinity, alignment: .leading)
                .vmCard(c)
            }
        }
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

    // MARK: Pazarlama sekmesi

    /// Web'de reklam harcaması ve ROAS entegrasyondan gelir; bağlı hesap yoksa
    /// uyarı bloğu gösterilir. Mockup'ta bağlantı yok → aynı uyarı hâli.
    private var marketingTab: some View {
        let spend = transactions
            .filter { $0.category == "Pazarlama" }
            .reduce(0) { $0 + ($1.amountBase ?? 0) }

        return VStack(alignment: .leading, spacing: VMSpace.lg) {
            VStack(alignment: .leading, spacing: 4) {
                Text(S.Reports.Marketing.noData)
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

            moneyTile("\(S.Reports.Marketing.spend) (\(MockData.baseCurrency))", spend, c.text)
        }
    }

    // MARK: Yardımcı

    private struct MonthBucket {
        let label: String
        let value: Int
    }

    /// Son 6 ay (bu ay dahil) — web'deki `monthlyRange` ile aynı pencere.
    private func monthBuckets(_ value: (Date) -> Int) -> [MonthBucket] {
        (0..<6).reversed().map { offset in
            let month = Period.monthStart(offset: -offset)
            return MonthBucket(label: VMFormat.shortMonth(month), value: value(month))
        }
    }
}
