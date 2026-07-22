import SwiftUI

struct MainTabView: View {
  var body: some View {
    TabView {
      NavigationStack {
        PatientsView()
      }
      .tabItem {
        Label("Hastalar", systemImage: "person.2")
      }

      NavigationStack {
        ComingSoonView(message: "Yakında — Adım 5")
      }
      .tabItem {
        Label("Randevular", systemImage: "calendar")
      }

      NavigationStack {
        ComingSoonView(message: "Yakında — Adım 6")
      }
      .tabItem {
        Label("Finans", systemImage: "turkishlirasign.circle")
      }

      NavigationStack {
        ComingSoonView(message: "Yakında — Adım 7")
      }
      .tabItem {
        Label("Raporlar", systemImage: "chart.bar")
      }

      NavigationStack {
        ComingSoonView(message: "Yakında — Adım 8")
      }
      .tabItem {
        Label("Ayarlar", systemImage: "gearshape")
      }
    }
    .tint(VerimayaTheme.brand)
  }
}

private struct ComingSoonView: View {
  let message: String

  var body: some View {
    ZStack {
      VerimayaTheme.bg.ignoresSafeArea()
      Text(message)
        .foregroundStyle(VerimayaTheme.textMuted)
    }
  }
}
