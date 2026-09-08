import SwiftUI

@main
struct VerimayaApp: App {
  @StateObject private var session = SessionStore()
  @AppStorage("verimaya:theme") private var themeRaw = ThemePreference.system.rawValue

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(session)
        .environmentObject(APIClient.shared)
        .preferredColorScheme(ThemePreference(rawValue: themeRaw)?.colorScheme)
        .task { await session.bootstrap() }
    }
  }
}
