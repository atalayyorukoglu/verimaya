import SwiftUI

struct MainTabView: View {
  var body: some View {
    TabView {
      NavigationStack {
        ContactsView()
      }
      .tabItem {
        Label("Kişiler", systemImage: "person.2")
      }

      NavigationStack {
        AppointmentsView()
      }
      .tabItem {
        Label("Randevular", systemImage: "calendar")
      }

      NavigationStack {
        TransactionsView()
      }
      .tabItem {
        Label("Finans", systemImage: "turkishlirasign.circle")
      }

      NavigationStack {
        InboxView()
      }
      .tabItem {
        Label("AI işlem", systemImage: "sparkles")
      }

      NavigationStack {
        ReportsView()
      }
      .tabItem {
        Label("Raporlar", systemImage: "chart.bar")
      }

      NavigationStack {
        SettingsView()
      }
      .tabItem {
        Label("Ayarlar", systemImage: "gearshape")
      }
    }
    .tint(VerimayaTheme.brand)
  }
}
