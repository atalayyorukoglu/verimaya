import SwiftUI

/// Panelin mobil kabuğu — web'deki `AppShell.svelte` ile aynı yapı.
///
/// Üstte: marka işareti · (varsa) dönem denetimi · arama · zil.
/// Altta: Finans · Kişiler · Randevular · Raporlar · Menü — bu sırayla
/// (`apps/web/src/lib/navigation.ts` → `mobileTabItems`).
/// Menü, web'deki soldan açılan çekmeceyi karşılar.
struct AppShell: View {
  @State private var tab: PanelTab = .finance
  @State private var menuOpen = false

  var body: some View {
    ZStack(alignment: .bottom) {
      VerimayaTheme.bg.ignoresSafeArea()

      VStack(spacing: 0) {
        PanelHeader(showsPeriod: tab.showsPeriod)

        Group {
          switch tab {
          case .finance: TransactionsView(onOpenAI: { tab = .aiTransaction })
          case .contacts: ContactsView()
          case .appointments: AppointmentsView()
          case .reports: ReportsView()
          case .aiTransaction: InboxView()
          case .settings: SettingsView()
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }

      PanelTabBar(current: tab, menuOpen: menuOpen) { selected in
        if let selected {
          tab = selected
          menuOpen = false
        } else {
          menuOpen.toggle()
        }
      }
    }
    .sheet(isPresented: $menuOpen) {
      PanelMenuSheet(current: tab) { selected in
        tab = selected
        menuOpen = false
      }
    }
  }
}

/// Alt sekmede görünenler + menüden ulaşılanlar.
enum PanelTab: String, CaseIterable, Identifiable {
  case finance, contacts, appointments, reports, aiTransaction, settings

  var id: String { rawValue }

  var label: String {
    switch self {
    case .finance: "Finans"
    case .contacts: "Kişiler"
    case .appointments: "Randevular"
    case .reports: "Raporlar"
    case .aiTransaction: "AI ile İşlem"
    case .settings: "Ayarlar"
    }
  }

  var icon: String {
    switch self {
    case .finance: "wallet.bifold"
    case .contacts: "person.2"
    case .appointments: "calendar"
    case .reports: "chart.bar"
    case .aiTransaction: "sparkles"
    case .settings: "gearshape"
    }
  }

  /// Dönem denetimi yalnız dönemi olan sayfalarda görünür (web ile aynı kural).
  var showsPeriod: Bool {
    self == .appointments || self == .reports || self == .finance
  }

  /// Web'deki `mobileTabItems` — sırası birebir.
  static let bottomTabs: [PanelTab] = [.finance, .contacts, .appointments, .reports]
}

/// Üst şerit: marka · dönem · arama · zil.
private struct PanelHeader: View {
  let showsPeriod: Bool

  var body: some View {
    HStack(spacing: 8) {
      BrandMark()

      if showsPeriod {
        PeriodControl()
          .frame(maxWidth: .infinity)
      } else {
        Spacer(minLength: 0)
      }

      Button {} label: {
        Image(systemName: "magnifyingglass")
          .font(.title3)
          .foregroundStyle(VerimayaTheme.textMuted)
          .frame(width: 40, height: 40)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Ara")

      Button {} label: {
        Image(systemName: "bell")
          .font(.title3)
          .foregroundStyle(VerimayaTheme.textMuted)
          .frame(width: 40, height: 40)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Değişiklikler")
    }
    .padding(.horizontal, VerimayaUI.pagePadding)
    .frame(height: 56)
    .background(VerimayaTheme.bg)
    .overlay(alignment: .bottom) {
      Rectangle().fill(VerimayaTheme.border).frame(height: 1)
    }
  }
}

/// Web'deki kare marka işaretinin sade karşılığı.
private struct BrandMark: View {
  var body: some View {
    Text("V")
      .font(.headline.weight(.bold))
      .foregroundStyle(VerimayaTheme.onBrand)
      .frame(width: 32, height: 32)
      .background(VerimayaTheme.text)
      .clipShape(RoundedRectangle(cornerRadius: 6))
  }
}

/// `‹ Eylül 2026 ›` — web'deki `HeaderPeriodPicker`.
private struct PeriodControl: View {
  @State private var month = Date()

  private var label: String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "tr_TR")
    f.dateFormat = "LLLL yyyy"
    return f.string(from: month).capitalized(with: Locale(identifier: "tr_TR"))
  }

  var body: some View {
    HStack(spacing: 0) {
      stepper(icon: "chevron.left") { shift(-1) }
      Text(label)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(VerimayaTheme.text)
        .lineLimit(1)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 4)
      stepper(icon: "chevron.right") { shift(1) }
    }
    .frame(height: 40)
    .background(VerimayaTheme.surface)
    .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
    .overlay(
      RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl)
        .stroke(VerimayaTheme.border, lineWidth: 1)
    )
  }

  private func stepper(icon: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: icon)
        .font(.caption.weight(.semibold))
        .foregroundStyle(VerimayaTheme.textMuted)
        .frame(width: 36, height: 40)
    }
    .buttonStyle(.plain)
  }

  private func shift(_ months: Int) {
    month = Calendar.current.date(byAdding: .month, value: months, to: month) ?? month
  }
}

/// Alt sekme çubuğu — dört sayfa + Menü.
private struct PanelTabBar: View {
  let current: PanelTab
  let menuOpen: Bool
  /// nil = Menü'ye basıldı.
  let onSelect: (PanelTab?) -> Void

  var body: some View {
    HStack(spacing: 0) {
      ForEach(PanelTab.bottomTabs) { tab in
        item(icon: tab.icon, label: tab.label, active: current == tab) { onSelect(tab) }
      }
      item(icon: "line.3.horizontal", label: "Menü", active: menuOpen) { onSelect(nil) }
    }
    .frame(height: 56)
    .background(.regularMaterial)
    .overlay(alignment: .top) {
      Rectangle().fill(VerimayaTheme.border).frame(height: 1)
    }
  }

  private func item(
    icon: String, label: String, active: Bool, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      VStack(spacing: 3) {
        Image(systemName: icon)
          .font(.system(size: 19))
        Text(label)
          .font(.system(size: 10, weight: .medium))
          .lineLimit(1)
      }
      .foregroundStyle(active ? VerimayaTheme.brand : VerimayaTheme.textMuted)
      .frame(maxWidth: .infinity)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

/// Web'deki menü çekmecesi: gruplu liste + altta sürüm satırı.
private struct PanelMenuSheet: View {
  let current: PanelTab
  let onSelect: (PanelTab) -> Void

  @Environment(\.dismiss) private var dismiss
  @EnvironmentObject private var session: SessionStore

  /// Web'deki gruplama (Ürünler / Araçlar / Sistem). Yalnız uygulamada
  /// karşılığı olan sayfalar listelenir — çalışmayan satır göstermeyiz.
  private let groups: [(String, [PanelTab])] = [
    ("Ürünler", [.contacts, .appointments, .finance, .reports]),
    ("Araçlar", [.aiTransaction]),
    ("Sistem", [.settings])
  ]

  var body: some View {
    NavigationStack {
      ZStack {
        VerimayaTheme.bg.ignoresSafeArea()

        VStack(spacing: 0) {
          List {
            ForEach(groups, id: \.0) { group in
              Section {
                ForEach(group.1) { tab in
                  Button {
                    onSelect(tab)
                    dismiss()
                  } label: {
                    HStack(spacing: 12) {
                      Image(systemName: tab.icon)
                        .font(.body)
                        .frame(width: 24)
                      Text(tab.label)
                        .font(.body)
                      Spacer()
                    }
                    .foregroundStyle(current == tab ? VerimayaTheme.brand : VerimayaTheme.text)
                    .padding(.vertical, 4)
                  }
                  .listRowBackground(
                    current == tab ? VerimayaTheme.brandSubtle : VerimayaTheme.surface
                  )
                }
              } header: {
                Text(group.0)
                  .font(.caption)
                  .foregroundStyle(VerimayaTheme.textMuted)
              }
            }
          }
          .listStyle(.insetGrouped)
          .scrollContentBackground(.hidden)

          Divider()
          Text("Verimaya · \(Bundle.main.appVersion)")
            .font(.caption)
            .foregroundStyle(VerimayaTheme.textFaint)
            .padding(.vertical, 12)
        }
      }
      .navigationTitle(session.name ?? "Menü")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button {
            dismiss()
          } label: {
            Image(systemName: "xmark")
          }
          .accessibilityLabel("Kapat")
        }
      }
    }
  }
}

extension Bundle {
  var appVersion: String {
    let v = object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    return "v\(v)"
  }
}
