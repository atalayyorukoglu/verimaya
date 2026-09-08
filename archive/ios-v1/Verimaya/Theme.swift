import SwiftUI
import UIKit

/// Warm-neutral palette from docs/TASARIM.md. Raw hex lives ONLY here; screens
/// use the semantic tokens. Colors resolve light/dark dynamically.
enum VerimayaTheme {
  // Brand (same hex both themes; hover differs)
  static let brand = dynamic(light: 0xD97757, dark: 0xD97757)
  static let brandHover = dynamic(light: 0xC46648, dark: 0xE89274)
  static let brandSubtle = Color(hex: 0xD97757).opacity(0.14)
  static let onBrand = Color.white

  // Surfaces / text
  static let bg = dynamic(light: 0xF9F9F8, dark: 0x1A1A19)
  static let surface = dynamic(light: 0xFFFFFF, dark: 0x242423)
  static let surface2 = dynamic(light: 0xF4F4F3, dark: 0x2E2E2D)
  static let border = dynamic(light: 0xE5E5E3, dark: 0x333332)
  static let text = dynamic(light: 0x1A1A19, dark: 0xEDEDEC)
  static let textMuted = dynamic(light: 0x6B6B68, dark: 0x8A8A87)
  static let textFaint = dynamic(light: 0x9A9A96, dark: 0x6E6E6B)

  // Status
  static let success = dynamic(light: 0x2E7D32, dark: 0x4CAF50)
  static let warning = dynamic(light: 0x9A6700, dark: 0xD4A017)
  static let danger = dynamic(light: 0xC62828, dark: 0xEF5350)
  static let info = dynamic(light: 0x5A6E8A, dark: 0x8A9BB5)

  // Radii
  static let radiusCard: CGFloat = 8
  static let radiusControl: CGFloat = 6

  private static func dynamic(light: UInt32, dark: UInt32) -> Color {
    Color(UIColor { trait in
      trait.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light)
    })
  }
}

extension Color {
  init(hex: UInt32) {
    let r = Double((hex >> 16) & 0xFF) / 255
    let g = Double((hex >> 8) & 0xFF) / 255
    let b = Double(hex & 0xFF) / 255
    self.init(red: r, green: g, blue: b)
  }
}

extension UIColor {
  convenience init(hex: UInt32) {
    let r = CGFloat((hex >> 16) & 0xFF) / 255
    let g = CGFloat((hex >> 8) & 0xFF) / 255
    let b = CGFloat(hex & 0xFF) / 255
    self.init(red: r, green: g, blue: b, alpha: 1)
  }
}
