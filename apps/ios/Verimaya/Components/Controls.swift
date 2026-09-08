import SwiftUI

/*
 Ortak kontroller — web'deki `PageHeader.svelte`, `Button` (shadcn) ve
 `filterFieldClass` karşılıkları.

 Ölçüler Tailwind sınıflarından: mobil kontrol `h-11` (44pt dokunma hedefi),
 kart `rounded-lg` (8), kontrol `rounded-[6px]` (6), sayfa dolgusu `p-4` (16).
*/

// MARK: - Sayfa başlığı

/// `PageHeader.svelte` — başlık + açıklama, sağda eylemler.
/// Mobil: `text-base font-semibold` başlık, `text-sm text-text-muted` açıklama, `mb-6`.
struct PageHeader<Actions: View>: View {
    @Environment(\.palette) private var c

    let title: String
    var description: String?
    @ViewBuilder var actions: Actions

    var body: some View {
        HStack(alignment: .center, spacing: VMSpace.md) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(VMFont.semibold(16))
                    .foregroundStyle(c.text)
                if let description {
                    Text(description)
                        .font(VMFont.sm)
                        .foregroundStyle(c.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            actions
        }
        .padding(.bottom, 24)
    }
}

extension PageHeader where Actions == EmptyView {
    init(title: String, description: String? = nil) {
        self.init(title: title, description: description, actions: { EmptyView() })
    }
}

/// Kişiler/Randevular sayfalarındaki başlık: alt çizgili blok (`border-b pb-4 mb-4`).
struct SectionHeaderBlock<Content: View>: View {
    @Environment(\.palette) private var c
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content
            Divider()
                .overlay(c.border)
                .padding(.top, VMSpace.lg)
        }
        .padding(.bottom, VMSpace.lg)
    }
}

// MARK: - Düğmeler

enum VMButtonVariant {
    case primary
    case outline
    case secondary
}

/// shadcn `Button` karşılığı. Mobilde yükseklik 44 (`h-11`).
struct VMButton: View {
    @Environment(\.palette) private var c

    let title: String
    var systemImage: String?
    var variant: VMButtonVariant = .primary
    var fullWidth = false
    var disabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 15, weight: .medium))
                }
                if !title.isEmpty {
                    Text(title)
                        .font(VMFont.medium(14))
                }
            }
            .padding(.horizontal, title.isEmpty ? 0 : 14)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .frame(width: title.isEmpty ? VMSize.control : nil, height: VMSize.control)
            .foregroundStyle(foreground)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous)
                    .stroke(borderColor, lineWidth: 1)
            )
            .opacity(disabled ? 0.45 : 1)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }

    private var foreground: Color {
        switch variant {
        case .primary: return c.onBrand
        case .outline: return c.text
        case .secondary: return c.text
        }
    }

    private var background: Color {
        switch variant {
        case .primary: return c.brand
        case .outline: return .clear
        case .secondary: return c.surface2
        }
    }

    private var borderColor: Color {
        variant == .primary ? .clear : c.border
    }
}

// MARK: - Süzgeç seçicisi

/// `filterFieldClass` karşılığı: `h-11` yükseklik, `rounded-[6px]`, chevron sağda.
/// Menü açar; seçim anında uygulanır (web'de `<select>` de öyle).
struct VMSelect: View {
    @Environment(\.palette) private var c

    let options: [(value: String, label: String)]
    @Binding var selection: String
    let accessibilityLabel: String

    private var currentLabel: String {
        options.first { $0.value == selection }?.label ?? options.first?.label ?? ""
    }

    var body: some View {
        Menu {
            ForEach(options, id: \.value) { option in
                Button {
                    selection = option.value
                } label: {
                    if option.value == selection {
                        Label(option.label, systemImage: "checkmark")
                    } else {
                        Text(option.label)
                    }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Text(currentLabel)
                    .font(VMFont.sm)
                    .foregroundStyle(c.text)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(c.textMuted)
            }
            .padding(.horizontal, 12)
            .frame(height: VMSize.control)
            .frame(maxWidth: .infinity)
            .background(c.surface)
            .clipShape(RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous)
                    .stroke(c.border, lineWidth: 1)
            )
        }
        .accessibilityLabel(accessibilityLabel)
    }
}

/// Arama/metin girişi — `h-11 rounded-[6px] border bg-surface px-3 text-base`.
struct VMTextField: View {
    @Environment(\.palette) private var c

    let placeholder: String
    @Binding var text: String
    var secure = false

    var body: some View {
        Group {
            if secure {
                SecureField("", text: $text, prompt: promptText)
            } else {
                TextField("", text: $text, prompt: promptText)
            }
        }
        .font(VMFont.base)
        .foregroundStyle(c.text)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .padding(.horizontal, 12)
        .frame(height: VMSize.control)
        .background(c.surface)
        .clipShape(RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: VMRadius.control, style: .continuous)
                .stroke(c.border, lineWidth: 1)
        )
    }

    private var promptText: Text {
        Text(placeholder).foregroundColor(c.textFaint)
    }
}

// MARK: - Boş durum kartı

/// `rounded-lg border bg-surface p-8 text-center`.
struct EmptyStateCard<Content: View>: View {
    @Environment(\.palette) private var c
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: VMSpace.md) {
            content
        }
        .frame(maxWidth: .infinity)
        .padding(32)
        .vmCard(c)
    }
}

// MARK: - İçerik kartı

/// `rounded-lg border border-border bg-surface p-4` — rapor/ayar bölümleri.
struct VMSection<Content: View>: View {
    @Environment(\.palette) private var c

    var title: String?
    var subtitle: String?
    var trailing: AnyView?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: VMSpace.md) {
            if title != nil || subtitle != nil {
                HStack(alignment: .top, spacing: VMSpace.sm) {
                    VStack(alignment: .leading, spacing: 2) {
                        if let title {
                            Text(title)
                                .font(VMFont.semibold(14))
                                .foregroundStyle(c.text)
                        }
                        if let subtitle {
                            Text(subtitle)
                                .font(VMFont.xs)
                                .foregroundStyle(c.textMuted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 0)
                    if let trailing { trailing }
                }
            }
            content
        }
        .padding(VMSpace.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .vmCard(c)
    }
}
