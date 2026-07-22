import SwiftUI

enum ThemePreference: String, CaseIterable, Identifiable {
  case system
  case light
  case dark

  var id: String { rawValue }

  var label: String {
    switch self {
    case .system: "Sistem"
    case .light: "Açık"
    case .dark: "Koyu"
    }
  }

  /// `nil` means follow the device appearance.
  var colorScheme: ColorScheme? {
    switch self {
    case .system: nil
    case .light: .light
    case .dark: .dark
    }
  }
}
