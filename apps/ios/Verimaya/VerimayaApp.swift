import SwiftUI

/// Verimaya iOS — mockup arayüz.
/// Bu teslimde ağ katmanı YOK; bütün ekranlar `MockData` ile çalışır.
@main
struct VerimayaApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(\.locale, VMFormat.locale)
        }
    }
}
