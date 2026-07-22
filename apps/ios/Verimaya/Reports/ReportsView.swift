import Charts
import SwiftUI

struct ReportsView: View {
  @StateObject private var vm = ReportsViewModel()

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

        Picker("Dönem", selection: Binding(
          get: { vm.preset },
          set: { newValue in
            Task { await vm.setPreset(newValue) }
          }
        )) {
          ForEach(PeriodPreset.allCases) { p in
            Text(p.label).tag(p)
          }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)

        if vm.isLoading && vm.summary == nil && vm.marketing == nil {
          ProgressView("Yükleniyor…")
            .tint(VerimayaTheme.brand)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
          ScrollView {
            VStack(alignment: .leading, spacing: 16) {
              if vm.isLoading {
                ProgressView()
                  .tint(VerimayaTheme.brand)
                  .frame(maxWidth: .infinity)
              }

              marketingCard
              summaryCard
              monthlyCard
              categoryCard
            }
            .padding(16)
          }
          .refreshable { await vm.load() }
        }
      }
    }
    .navigationTitle("Raporlar")
    .task { await vm.load() }
  }

  // MARK: - Gerçek ROAS

  private var marketingCard: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Gerçek ROAS")
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(VerimayaTheme.brand)

      Text(roasText(vm.marketing?.realRoas))
        .font(.system(size: 36, weight: .bold, design: .rounded))
        .foregroundStyle(VerimayaTheme.text)

      if let m = vm.marketing {
        HStack(spacing: 8) {
          metricChip(label: "Harcama", value: Money.format(minor: m.spendBase), color: VerimayaTheme.danger)
          metricChip(label: "Gelir", value: Money.format(minor: m.revenueBase), color: VerimayaTheme.success)
        }
        HStack(spacing: 8) {
          metricChip(label: "Lead", value: "\(m.leadsCount)", color: VerimayaTheme.text)
          metricChip(label: "Kapanan", value: "\(m.closedCount)", color: VerimayaTheme.text)
        }

        VStack(alignment: .leading, spacing: 6) {
          secondaryRow(label: "Lead başı maliyet", value: optionalMoney(m.costPerLead))
          secondaryRow(label: "Kapanan başı maliyet", value: optionalMoney(m.costPerClosed))
        }
        .padding(.top, 4)

        Divider().overlay(VerimayaTheme.border)

        Text("Kaynak kırılımı")
          .font(.caption.weight(.semibold))
          .foregroundStyle(VerimayaTheme.textMuted)

        if m.bySource.isEmpty {
          Text("Kaynak verisi yok")
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textFaint)
        } else {
          ForEach(m.bySource) { row in
            HStack {
              VStack(alignment: .leading, spacing: 2) {
                Text(row.source)
                  .font(.subheadline.weight(.medium))
                  .foregroundStyle(VerimayaTheme.text)
                Text("\(row.leads) lead · \(row.closed) kapanan")
                  .font(.caption)
                  .foregroundStyle(VerimayaTheme.textMuted)
              }
              Spacer()
              Text(Money.format(minor: row.revenueBase))
                .font(.subheadline.weight(.medium))
                .foregroundStyle(VerimayaTheme.success)
                .monospacedDigit()
            }
          }
        }
      } else {
        Text("Pazarlama verisi yok")
          .font(.subheadline)
          .foregroundStyle(VerimayaTheme.textFaint)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(VerimayaTheme.brandSubtle)
    .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusCard))
    .overlay(
      RoundedRectangle(cornerRadius: VerimayaTheme.radiusCard)
        .stroke(VerimayaTheme.brand.opacity(0.35), lineWidth: 1)
    )
  }

  // MARK: - Özet

  private var summaryCard: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Özet")
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(VerimayaTheme.textMuted)

      if let s = vm.summary {
        moneyRow(label: "Gelir", value: Money.format(minor: s.incomeBase), color: VerimayaTheme.success)
        moneyRow(label: "Gider", value: Money.format(minor: s.expenseBase), color: VerimayaTheme.danger)
        moneyRow(
          label: "Net",
          value: Money.format(minor: s.netBase),
          color: s.netBase < 0 ? VerimayaTheme.danger : VerimayaTheme.success
        )
        moneyRow(label: "İşlem sayısı", value: "\(s.transactionCount)", color: VerimayaTheme.text)
      } else {
        Text("Veri yok")
          .font(.subheadline)
          .foregroundStyle(VerimayaTheme.textFaint)
      }
    }
    .reportCard()
  }

  // MARK: - Aylık

  private var monthlyCard: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Aylık")
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(VerimayaTheme.textMuted)

      if let items = vm.monthly?.items, !items.isEmpty {
        Chart {
          ForEach(chartPoints(from: items)) { point in
            BarMark(
              x: .value("Ay", point.monthLabel),
              y: .value("Tutar", point.major)
            )
            .foregroundStyle(by: .value("Tür", point.series))
            .position(by: .value("Tür", point.series))
          }
        }
        .chartForegroundStyleScale([
          "Gelir": VerimayaTheme.success,
          "Gider": VerimayaTheme.danger
        ])
        .chartYAxis {
          AxisMarks(position: .leading)
        }
        .frame(height: 200)

        ForEach(items) { row in
          HStack {
            Text(shortMonth(row.month))
              .font(.caption)
              .foregroundStyle(VerimayaTheme.textMuted)
              .frame(width: 56, alignment: .leading)
            Spacer()
            Text(Money.format(minor: row.netBase))
              .font(.caption.weight(.medium))
              .foregroundStyle(row.netBase < 0 ? VerimayaTheme.danger : VerimayaTheme.success)
              .monospacedDigit()
          }
        }
      } else {
        Text("Veri yok")
          .font(.subheadline)
          .foregroundStyle(VerimayaTheme.textFaint)
      }
    }
    .reportCard()
  }

  // MARK: - Kategori

  private var categoryCard: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Kategori")
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(VerimayaTheme.textMuted)

      if let items = vm.byCategory?.items, !items.isEmpty {
        ForEach(items) { row in
          HStack {
            Text(row.categoryName)
              .font(.subheadline)
              .foregroundStyle(VerimayaTheme.text)
            Spacer()
            Text(Money.format(minor: row.netBase))
              .font(.subheadline.weight(.medium))
              .foregroundStyle(row.netBase < 0 ? VerimayaTheme.danger : VerimayaTheme.success)
              .monospacedDigit()
          }
        }
      } else {
        Text("Veri yok")
          .font(.subheadline)
          .foregroundStyle(VerimayaTheme.textFaint)
      }
    }
    .reportCard()
  }

  // MARK: - Helpers

  private func metricChip(label: String, value: String, color: Color) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(label)
        .font(.caption2)
        .foregroundStyle(VerimayaTheme.textMuted)
      Text(value)
        .font(.caption.weight(.semibold))
        .foregroundStyle(color)
        .monospacedDigit()
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(VerimayaTheme.surface.opacity(0.85))
    .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
  }

  private func secondaryRow(label: String, value: String) -> some View {
    HStack {
      Text(label)
        .font(.caption)
        .foregroundStyle(VerimayaTheme.textMuted)
      Spacer()
      Text(value)
        .font(.caption.weight(.medium))
        .foregroundStyle(VerimayaTheme.text)
        .monospacedDigit()
    }
  }

  private func moneyRow(label: String, value: String, color: Color) -> some View {
    HStack {
      Text(label)
        .font(.subheadline)
        .foregroundStyle(VerimayaTheme.textMuted)
      Spacer()
      Text(value)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(color)
        .monospacedDigit()
    }
  }

  private func roasText(_ value: Double?) -> String {
    guard let value else { return "—" }
    let f = NumberFormatter()
    f.locale = Locale(identifier: "tr_TR")
    f.minimumFractionDigits = 2
    f.maximumFractionDigits = 2
    let number = f.string(from: NSNumber(value: value)) ?? String(format: "%.2f", value)
    return "\(number)×"
  }

  private func optionalMoney(_ minor: Int?) -> String {
    guard let minor else { return "—" }
    return Money.format(minor: minor)
  }

  private func shortMonth(_ yyyyMM: String) -> String {
    let inF = DateFormatter()
    inF.locale = Locale(identifier: "tr_TR")
    inF.dateFormat = "yyyy-MM"
    guard let date = inF.date(from: yyyyMM) else { return yyyyMM }
    let outF = DateFormatter()
    outF.locale = Locale(identifier: "tr_TR")
    outF.dateFormat = "MMM yy"
    return outF.string(from: date)
  }

  private func chartPoints(from items: [ReportMonthRow]) -> [MonthChartPoint] {
    items.flatMap { row in
      let label = shortMonth(row.month)
      return [
        MonthChartPoint(id: "\(row.month)-income", monthLabel: label, series: "Gelir", major: Double(row.incomeBase) / 100),
        MonthChartPoint(id: "\(row.month)-expense", monthLabel: label, series: "Gider", major: Double(row.expenseBase) / 100)
      ]
    }
  }
}

private struct MonthChartPoint: Identifiable {
  let id: String
  let monthLabel: String
  let series: String
  let major: Double
}

private extension View {
  func reportCard() -> some View {
    self
      .padding(16)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(VerimayaTheme.surface)
      .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusCard))
      .overlay(
        RoundedRectangle(cornerRadius: VerimayaTheme.radiusCard)
          .stroke(VerimayaTheme.border, lineWidth: 1)
      )
  }
}
