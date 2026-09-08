import SwiftUI

/// Raporlar — web panelindeki `/reports` mobil görünümü.
///
/// Düzen: başlık + segmentli seçim (Özet · Kategori · Pazarlama) ·
/// kart içinde bölüm başlığı, açıklama, 2×2 sayı kutuları ve kırılım listeleri.
struct ReportsView: View {
  @ObservedObject var period: PanelPeriod

  @StateObject private var vm = ReportsViewModel()
  @State private var section: ReportSection = .summary

  enum ReportSection: String, CaseIterable, Identifiable {
    case summary, category, marketing
    var id: String { rawValue }
    var label: String {
      switch self {
      case .summary: "Özet"
      case .category: "Kategori"
      case .marketing: "Pazarlama"
      }
    }
    var icon: String {
      switch self {
      case .summary: "square.grid.2x2"
      case .category: "square.stack.3d.up"
      case .marketing: "megaphone"
      }
    }
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        if let message = vm.statusMessage {
          Text(message)
            .font(.footnote)
            .foregroundStyle(VerimayaTheme.danger)
        }

        HStack(alignment: .center, spacing: 8) {
          // Web'de başlık ve üç düğme tek satıra sığıyor; iOS'ta başlık bir
          // punto küçültülmeden sığmıyordu.
          Text("Raporlar")
            .font(.title3.weight(.semibold))
            .foregroundStyle(VerimayaTheme.text)
            .lineLimit(1)
            .fixedSize()
          Spacer(minLength: 6)
          sectionPicker
        }

        switch section {
        case .summary: summaryCard
        case .category: categoryCard
        case .marketing: marketingCard
        }
      }
      .padding(VerimayaUI.pagePadding)
      .padding(.bottom, 72)
    }
    .background(VerimayaTheme.bg)
    .refreshable { await reload() }
    .task { await reload() }
    .onChange(of: period.month) { _, _ in Task { await reload() } }
  }

  /// Üst şeritteki dönem raporlara da geçer — web'de de aynı denetim.
  private func reload() async {
    vm.from = period.from
    vm.to = period.to
    await vm.load()
  }

  /// Web'deki üç düğmeli seçim — seçili olan marka zeminli.
  private var sectionPicker: some View {
    HStack(spacing: 6) {
      ForEach(ReportSection.allCases) { item in
        Button {
          section = item
        } label: {
          HStack(spacing: 4) {
            Image(systemName: item.icon).font(.caption2)
            Text(item.label)
              .font(.footnote.weight(.medium))
              .lineLimit(1)
              .fixedSize()
          }
          .foregroundStyle(section == item ? VerimayaTheme.onBrand : VerimayaTheme.text)
          .padding(.horizontal, 9)
          .frame(height: 36)
          .background(section == item ? VerimayaTheme.brand : VerimayaTheme.surface)
          .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
          .overlay(
            RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl)
              .stroke(section == item ? .clear : VerimayaTheme.border, lineWidth: 1)
          )
        }
        .buttonStyle(.plain)
      }
    }
  }

  private var summaryCard: some View {
    PanelCard {
      VStack(alignment: .leading, spacing: 14) {
        cardHeading("Finans", "Gelir, gider ve tahsilat durumu.")

        let s = vm.summary
        HStack(spacing: 10) {
          StatTile(
            label: "Gelir",
            value: Money.format(minor: s?.incomeBase ?? 0),
            valueColor: VerimayaTheme.success
          )
          StatTile(label: "Gider", value: Money.format(minor: s?.expenseBase ?? 0))
        }
        HStack(spacing: 10) {
          StatTile(
            label: "Net",
            value: Money.format(minor: s?.netBase ?? 0),
            valueColor: (s?.netBase ?? 0) >= 0 ? VerimayaTheme.success : VerimayaTheme.danger
          )
          StatTile(label: "İşlem", value: "\(s?.transactionCount ?? 0)")
        }

        if let monthly = vm.monthly, !monthly.items.isEmpty {
          SectionCaption(text: "Aylık trend")
          ForEach(monthly.items) { row in
            breakdownRow(
              title: row.month,
              detail: "\(row.transactionCount) işlem · net \(Money.format(minor: row.netBase))"
            )
          }
        }
      }
    }
  }

  private var categoryCard: some View {
    PanelCard {
      VStack(alignment: .leading, spacing: 14) {
        cardHeading("Kategori", "Gelir ve giderin kategoriye göre dağılımı.")

        if let rows = vm.byCategory?.items, !rows.isEmpty {
          SectionCaption(text: "Kategori kırılımı")
          ForEach(rows) { row in
            breakdownRow(
              title: row.categoryName,
              detail: "\(row.transactionCount) · net \(Money.format(minor: row.netBase))"
            )
          }
        } else {
          emptyLine
        }
      }
    }
  }

  private var marketingCard: some View {
    PanelCard {
      VStack(alignment: .leading, spacing: 14) {
        cardHeading("Pazarlama", "Reklam harcaması, gelir ve gerçek ROAS.")

        let m = vm.marketing
        HStack(spacing: 10) {
          StatTile(label: "Harcama", value: Money.format(minor: m?.spendBase ?? 0))
          StatTile(
            label: "Gelir",
            value: Money.format(minor: m?.revenueBase ?? 0),
            valueColor: VerimayaTheme.success
          )
        }
        HStack(spacing: 10) {
          StatTile(label: "Gerçek ROAS", value: roasText(m?.realRoas))
          StatTile(label: "Lead", value: "\(m?.leadsCount ?? 0)")
        }

        if let rows = m?.bySource, !rows.isEmpty {
          SectionCaption(text: "Kaynak kırılımı")
          ForEach(rows) { row in
            breakdownRow(
              title: row.source,
              detail: "\(row.leads) lead · \(Money.format(minor: row.revenueBase))"
            )
          }
        }

        if m?.attributionMissing == true {
          Text("Kaynak bilgisi eksik kayıtlar var — oranlar olduğundan düşük görünebilir.")
            .font(.caption)
            .foregroundStyle(VerimayaTheme.warning)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    }
  }

  private func cardHeading(_ title: String, _ description: String) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(title)
        .font(.body.weight(.semibold))
        .foregroundStyle(VerimayaTheme.text)
      Text(description)
        .font(.subheadline)
        .foregroundStyle(VerimayaTheme.textMuted)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  /// Web'de kırılım satırları: solda ad, sağda değer, altta ince çizgi.
  private func breakdownRow(title: String, detail: String) -> some View {
    VStack(spacing: 0) {
      HStack(alignment: .firstTextBaseline) {
        Text(title)
          .font(.body)
          .foregroundStyle(VerimayaTheme.text)
        Spacer(minLength: 8)
        Text(detail)
          .font(.subheadline)
          .foregroundStyle(VerimayaTheme.textMuted)
          .monospacedDigit()
      }
      .padding(.vertical, 10)
      Divider().overlay(VerimayaTheme.border)
    }
  }

  private var emptyLine: some View {
    Text("Bu dönem için veri yok.")
      .font(.subheadline)
      .foregroundStyle(VerimayaTheme.textMuted)
      .padding(.vertical, 8)
  }

  private func roasText(_ value: Double?) -> String {
    guard let value else { return emptyDash }
    return String(format: "%.2f×", value)
  }
}
