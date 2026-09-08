import SwiftUI

/*
 Tasarım belirteçleri — tek kaynak.

 Değerler `docs/TASARIM.md` ve `apps/web/src/routes/layout.css` içindeki CSS
 değişkenlerinden birebir alındı. Bileşenlerde ham renk yazılmaz, daima belirteç.

 Web'de tema `<html>` üzerindeki `.dark` sınıfıyla değişir; burada `VMTheme`
 karşılığı `VMPalette.light` / `VMPalette.dark`.
*/

// MARK: - Renk yardımcıları

extension Color {
    /// `#RRGGBB` ya da `#RRGGBBAA` — CSS token'ları doğrudan yapıştırılabilsin diye.
    init(hex: String, opacity: Double = 1) {
        let cleaned = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}

// MARK: - Tema

enum VMTheme: String, CaseIterable {
    case light
    case dark

    var colorScheme: ColorScheme { self == .dark ? .dark : .light }

    var palette: VMPalette { self == .dark ? .dark : .light }
}

/// Web'deki `--brand`, `--bg`, `--surface`, … kümesinin Swift karşılığı.
struct VMPalette {
    let brand: Color
    let brandHover: Color
    let brandSubtle: Color
    let brandText: Color

    let bg: Color
    let surface: Color
    let surface2: Color
    let border: Color

    let text: Color
    let textMuted: Color
    let textFaint: Color

    let success: Color
    let warning: Color
    let danger: Color
    let info: Color

    /// `--primary-foreground` — brand zemin üzerindeki metin, iki temada da beyaz.
    let onBrand: Color

    static let light = VMPalette(
        brand: Color(hex: "#D97757"),
        brandHover: Color(hex: "#C46648"),
        brandSubtle: Color(hex: "#D97757", opacity: 0.14),
        brandText: Color(hex: "#8F452C"),
        bg: Color(hex: "#F9F9F8"),
        surface: Color(hex: "#FFFFFF"),
        surface2: Color(hex: "#F4F4F3"),
        border: Color(hex: "#E5E5E3"),
        text: Color(hex: "#1A1A19"),
        textMuted: Color(hex: "#6B6B68"),
        textFaint: Color(hex: "#73736F"),
        success: Color(hex: "#2E7D32"),
        warning: Color(hex: "#9A6700"),
        danger: Color(hex: "#C62828"),
        info: Color(hex: "#5A6E8A"),
        onBrand: Color(hex: "#FFFFFF")
    )

    static let dark = VMPalette(
        brand: Color(hex: "#D97757"),
        brandHover: Color(hex: "#E89274"),
        brandSubtle: Color(hex: "#D97757", opacity: 0.18),
        brandText: Color(hex: "#F0B8A4"),
        bg: Color(hex: "#1A1A19"),
        surface: Color(hex: "#242423"),
        surface2: Color(hex: "#2E2E2D"),
        border: Color(hex: "#333332"),
        text: Color(hex: "#EDEDEC"),
        textMuted: Color(hex: "#8E8E8A"),
        textFaint: Color(hex: "#858582"),
        success: Color(hex: "#4CAF50"),
        warning: Color(hex: "#D4A017"),
        danger: Color(hex: "#EF5350"),
        info: Color(hex: "#8A9BB5"),
        onBrand: Color(hex: "#FFFFFF")
    )
}

private struct VMPaletteKey: EnvironmentKey {
    static let defaultValue = VMPalette.light
}

extension EnvironmentValues {
    var palette: VMPalette {
        get { self[VMPaletteKey.self] }
        set { self[VMPaletteKey.self] = newValue }
    }
}

// MARK: - Ölçüler

/// Yarıçap — TASARIM.md: "kart 8px, kontrol 6px".
enum VMRadius {
    static let card: CGFloat = 8
    static let control: CGFloat = 6
    /// Randevu kartı `rounded-xl` kullanıyor (12px).
    static let cardLarge: CGFloat = 12
    static let panel: CGFloat = 10
}

/// 4px taban ölçek (Tailwind sınıflarının birebir karşılığı).
enum VMSpace {
    /// `p-4` — sayfa dolgusu.
    static let page: CGFloat = 16
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 20
}

/// Yükseklikler — `h-14` şeritler, `h-11` mobil dokunma hedefi, `h-9` masaüstü kontrol.
enum VMSize {
    static let chrome: CGFloat = 56
    static let control: CGFloat = 44
    static let compactControl: CGFloat = 36
}

/// Tipografi — Tailwind `text-*` karşılıkları (Inter yerine sistem fontu; bkz. README).
enum VMFont {
    static let xxs = Font.system(size: 10, weight: .medium)
    static let xs11 = Font.system(size: 11)
    static let xs = Font.system(size: 12)
    static let sm = Font.system(size: 14)
    static let base = Font.system(size: 16)
    static let lg = Font.system(size: 18, weight: .semibold)

    static func semibold(_ size: CGFloat) -> Font { .system(size: size, weight: .semibold) }
    static func medium(_ size: CGFloat) -> Font { .system(size: size, weight: .medium) }
}

// MARK: - Ortak görünüm parçaları

extension View {
    /// `rounded-lg border border-border bg-surface` — panelin kart temel biçimi.
    func vmCard(_ palette: VMPalette, radius: CGFloat = VMRadius.card) -> some View {
        self
            .background(palette.surface)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(palette.border, lineWidth: 1)
            )
    }
}
