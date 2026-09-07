import SwiftUI

/// Web panelindeki mobil görünümün birebir karşılıkları.
///
/// Kaynak: `apps/web` — kart `rounded-[8px] border border-border bg-surface`,
/// kontrol `rounded-[6px]`, sayfa dolgusu 16px. Renkler `VerimayaTheme`
/// üzerinden gelir (ikisi de `docs/TASARIM.md`'yi okur).
enum VerimayaUI {
  static let pagePadding: CGFloat = 16
  static let cardPadding: CGFloat = 16
  static let controlHeight: CGFloat = 44
}

/// `border border-border bg-surface rounded-[8px]` — panelin temel yüzeyi.
struct PanelCard<Content: View>: View {
  var padding: CGFloat = VerimayaUI.cardPadding
  @ViewBuilder var content: Content

  var body: some View {
    content
      .padding(padding)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(VerimayaTheme.surface)
      .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusCard))
      .overlay(
        RoundedRectangle(cornerRadius: VerimayaTheme.radiusCard)
          .stroke(VerimayaTheme.border, lineWidth: 1)
      )
  }
}

/// Sayfa başlığı: büyük başlık + altında ikincil satır (web'deki `PageHeader`).
struct PageTitle: View {
  let title: String
  var subtitle: String?
  var trailing: AnyView?

  init(_ title: String, subtitle: String? = nil) {
    self.title = title
    self.subtitle = subtitle
    self.trailing = nil
  }

  init<T: View>(_ title: String, subtitle: String? = nil, @ViewBuilder trailing: () -> T) {
    self.title = title
    self.subtitle = subtitle
    self.trailing = AnyView(trailing())
  }

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(.title2.weight(.semibold))
          .foregroundStyle(VerimayaTheme.text)
        if let subtitle {
          Text(subtitle)
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textMuted)
        }
      }
      Spacer(minLength: 8)
      if let trailing { trailing }
    }
  }
}

/// Panelin dolu (marka) düğmesi.
struct BrandButton: View {
  let title: String
  var systemImage: String?
  var action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        if let systemImage { Image(systemName: systemImage) }
        Text(title)
      }
      .font(.subheadline.weight(.medium))
      .foregroundStyle(VerimayaTheme.onBrand)
      .padding(.horizontal, 14)
      .frame(height: VerimayaUI.controlHeight)
      .background(VerimayaTheme.brand)
      .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
    }
    .buttonStyle(.plain)
  }
}

/// Panelin çerçeveli (ikincil) düğmesi.
struct OutlineButton: View {
  let title: String
  var systemImage: String?
  var badge: String?
  var action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        if let systemImage { Image(systemName: systemImage) }
        Text(title)
        if let badge {
          Text(badge)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(VerimayaTheme.onBrand)
            .frame(minWidth: 20, minHeight: 20)
            .background(VerimayaTheme.warning, in: Circle())
        }
      }
      .font(.subheadline.weight(.medium))
      .foregroundStyle(VerimayaTheme.text)
      .padding(.horizontal, 14)
      .frame(height: VerimayaUI.controlHeight)
      .background(VerimayaTheme.surface)
      .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
      .overlay(
        RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl)
          .stroke(VerimayaTheme.border, lineWidth: 1)
      )
    }
    .buttonStyle(.plain)
  }
}

/// Marka renkli kare "+" — web'de filtre satırının sonundaki ekleme düğmesi.
struct AddSquareButton: View {
  var action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: "plus")
        .font(.body.weight(.semibold))
        .foregroundStyle(VerimayaTheme.onBrand)
        .frame(width: VerimayaUI.controlHeight, height: VerimayaUI.controlHeight)
        .background(VerimayaTheme.brand)
        .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Yeni")
  }
}

/// Web'deki `<select>` — çerçeveli kutu, sağda aşağı ok.
struct SelectField<T: Hashable>: View {
  let title: String
  @Binding var selection: T
  let options: [(value: T, label: String)]

  var body: some View {
    Menu {
      ForEach(options, id: \.value) { option in
        Button(option.label) { selection = option.value }
      }
    } label: {
      HStack(spacing: 6) {
        Text(options.first { $0.value == selection }?.label ?? title)
          .lineLimit(1)
        Spacer(minLength: 4)
        Image(systemName: "chevron.down")
          .font(.caption.weight(.semibold))
          .foregroundStyle(VerimayaTheme.textMuted)
      }
      .font(.subheadline)
      .foregroundStyle(VerimayaTheme.text)
      .padding(.horizontal, 12)
      .frame(height: VerimayaUI.controlHeight)
      .frame(maxWidth: .infinity)
      .background(VerimayaTheme.surface)
      .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
      .overlay(
        RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl)
          .stroke(VerimayaTheme.border, lineWidth: 1)
      )
    }
  }
}

/// Durum rozeti — web'de yumuşak zemin + koyu metin.
struct Chip: View {
  let text: String
  var tone: Tone = .neutral
  var showsDot = false

  enum Tone {
    case neutral, success, warning, danger, info

    var color: Color {
      switch self {
      case .neutral: VerimayaTheme.textMuted
      case .success: VerimayaTheme.success
      case .warning: VerimayaTheme.warning
      case .danger: VerimayaTheme.danger
      case .info: VerimayaTheme.info
      }
    }
  }

  var body: some View {
    HStack(spacing: 5) {
      if showsDot {
        Circle().fill(tone.color).frame(width: 7, height: 7)
      }
      Text(text)
        .font(.caption.weight(.medium))
    }
    .foregroundStyle(tone.color)
    .padding(.horizontal, 8)
    .padding(.vertical, 5)
    .background(tone.color.opacity(0.12))
    .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
  }
}

/// Raporlardaki 2×2 sayı kutusu.
struct StatTile: View {
  let label: String
  let value: String
  var valueColor: Color = VerimayaTheme.text

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label)
        .font(.subheadline)
        .foregroundStyle(VerimayaTheme.textMuted)
      Text(value)
        .font(.title3.weight(.semibold))
        .foregroundStyle(valueColor)
        .monospacedDigit()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(14)
    .background(VerimayaTheme.surface2)
    .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
  }
}

/// Rapor bölüm başlığı — web'de küçük, harfleri büyük, seyrek.
struct SectionCaption: View {
  let text: String

  var body: some View {
    Text(text.uppercased())
      .font(.caption.weight(.semibold))
      .kerning(0.6)
      .foregroundStyle(VerimayaTheme.textMuted)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// Ad-soyaddan baş harf — randevu kartındaki daire.
enum Initials {
  static func from(_ name: String) -> String {
    let parts = name.split(separator: " ").prefix(2)
    let letters = parts.compactMap { $0.first.map(String.init) }
    return letters.joined().uppercased()
  }
}

struct AvatarCircle: View {
  let name: String

  var body: some View {
    Text(Initials.from(name))
      .font(.subheadline.weight(.medium))
      .foregroundStyle(VerimayaTheme.textMuted)
      .frame(width: 44, height: 44)
      .background(VerimayaTheme.surface2, in: Circle())
  }
}

/// Satır sonundaki kalem düğmesi.
struct EditPencil: View {
  var action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: "pencil")
        .font(.body)
        .foregroundStyle(VerimayaTheme.textMuted)
        .frame(width: 32, height: 32)
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Düzenle")
  }
}

/// Boş değer gösterimi — panelde her yerde uzun tire.
let emptyDash = "—"

extension Optional where Wrapped == String {
  /// Boş/eksik metni panelin uzun tiresine çevirir.
  var dashed: String {
    guard let self, !self.trimmingCharacters(in: .whitespaces).isEmpty else { return emptyDash }
    return self
  }
}
