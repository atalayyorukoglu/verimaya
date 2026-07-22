import SwiftUI

@main
struct VerimayaApp: App {
  @StateObject private var session = SessionStore()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(session)
        .environmentObject(APIClient.shared)
        .task { await session.bootstrap() }
    }
  }
}
