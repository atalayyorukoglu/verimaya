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
  @State private var searchOpen = false
  /// Dönem tek yerde tutulur; sayfalar bunu sunucu süzgecine çevirir.
  @StateObject private var period = PanelPeriod()

  var body: some View {
    ZStack(alignment: .bottom) {
      VerimayaTheme.bg.ignoresSafeArea()

      VStack(spacing: 0) {
        PanelHeader(
          showsPeriod: tab.showsPeriod,
          period: period,
          onSearch: { searchOpen = true }
        )

        Group {
          switch tab {
          case .finance: TransactionsView(period: period, onOpenAI: { tab = .aiTransaction })
          case .contacts: ContactsView()
          case .appointments: AppointmentsView(period: period)
          case .reports: ReportsView(period: period)
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
    .sheet(isPresented: $searchOpen) {
      PanelSearchSheet { destination in
        tab = destination
        searchOpen = false
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
    case .settings: "Profil ayarları"
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

/// Üst şerit: marka · dönem · arama.
///
/// Zil (değişiklik günlüğü) **bilinçli olarak yok**: web'de `/changelog`
/// sayfasına gidiyor, uygulamada o ekran yok. Hiçbir yere gitmeyen düğme
/// koymuyoruz.
private struct PanelHeader: View {
  let showsPeriod: Bool
  @ObservedObject var period: PanelPeriod
  let onSearch: () -> Void

  var body: some View {
    HStack(spacing: 8) {
      BrandMark()

      if showsPeriod {
        PeriodControl(period: period)
          .frame(maxWidth: .infinity)
      } else {
        Spacer(minLength: 0)
      }

      Button(action: onSearch) {
        Image(systemName: "magnifyingglass")
          .font(.title3)
          .foregroundStyle(VerimayaTheme.textMuted)
          .frame(width: 40, height: 40)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Ara")
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

/// `‹ Eylül 2026 ›` — web'deki `HeaderPeriodPicker`. Seçim sayfaların
/// sunucu süzgecine geçer; yalnız etiket değiştirmez.
private struct PeriodControl: View {
  @ObservedObject var period: PanelPeriod

  var body: some View {
    HStack(spacing: 0) {
      stepper(icon: "chevron.left") { period.shift(-1) }
      Text(period.label)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(VerimayaTheme.text)
        .lineLimit(1)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 4)
      stepper(icon: "chevron.right") { period.shift(1) }
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
