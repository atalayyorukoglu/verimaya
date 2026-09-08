import SwiftUI

/*
 Yükleme / hata göstergeleri — her ekranda aynı görünüm.

 Web'de bunlar tek satırlık `<p class="text-sm text-danger">` idi; burada hata
 şeridi ayrıca "Yeniden dene" düğmesi taşır (mobilde sayfayı yenilemek için
 tarayıcı yok).
*/

/// `{#if query.isPending}` karşılığı.
struct LoadingRow: View {
    @Environment(\.palette) private var c
    var label: String = S.Common.loading

    var body: some View {
        HStack(spacing: VMSpace.sm) {
            ProgressView()
                .controlSize(.small)
                .tint(c.textMuted)
            Text(label)
                .font(VMFont.sm)
                .foregroundStyle(c.textMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, VMSpace.sm)
    }
}

/// `{#if query.isError}` karşılığı + yeniden deneme.
struct ErrorBanner: View {
    @Environment(\.palette) private var c

    let message: String
    var retry: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: VMSpace.sm) {
            HStack(alignment: .top, spacing: VMSpace.sm) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 13))
                Text(message)
                    .font(VMFont.sm)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(c.danger)

            if let retry {
                VMButton(title: S.Common.retry, variant: .outline, action: retry)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(VMSpace.md)
        .background(c.danger.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous))
        .accessibilityIdentifier("error.banner")
    }
}

/// Liste sonundaki "Daha fazla yükle".
struct LoadMoreRow: View {
    let title: String
    let isLoading: Bool
    let action: () -> Void

    var body: some View {
        HStack {
            Spacer()
            VMButton(
                title: isLoading ? S.Common.loading : title,
                variant: .outline,
                disabled: isLoading,
                action: action
            )
            Spacer()
        }
        .padding(.top, VMSpace.lg)
    }
}
