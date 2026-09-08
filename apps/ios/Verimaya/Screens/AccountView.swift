import SwiftUI

/*
 `apps/web/src/routes/account/+page.svelte` — mobil hâl.

 Web düzeni: `PageHeader` + dört kart (`rounded-lg border bg-surface p-4`):
   1. Profil — görünen ad + e-posta (salt okunur, `dl/dt/dd`).
   2. Şifreni değiştir — üç alan + gönder düğmesi, hata/başarı satırı.
   3. Tema — `ThemeToggle variant="nav"` satırı, çerçeveli.
   4. Bildirim tercihleri — "yakında" notu.

 Şifre değiştirme mockup'ta sunucuya gitmez; doğrulama (eşleşme + en az 8
 karakter) gerçekten çalışır, sonuç yerel bir bildirimdir.
*/
struct AccountView: View {
    @Environment(\.palette) private var c
    @Environment(AppState.self) private var app

    @Binding var storedTheme: String

    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var newPassword2 = ""
    @State private var passwordError: String?
    @State private var passwordOk = false

    private var isDark: Bool { storedTheme == VMTheme.dark.rawValue }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VMSpace.lg) {
                backButton

                VStack(alignment: .leading, spacing: 4) {
                    Text(S.Account.title)
                        .font(VMFont.semibold(16))
                        .foregroundStyle(c.text)
                    Text(S.Account.description)
                        .font(VMFont.sm)
                        .foregroundStyle(c.textMuted)
                }

                profileCard
                passwordCard
                themeCard
                notificationsCard
            }
            .padding(VMSpace.page)
        }
        .background(c.bg)
    }

    private var backButton: some View {
        @Bindable var app = app

        return Button {
            switch app.tab {
            case .finance: if !app.financePath.isEmpty { app.financePath.removeLast() }
            case .contacts: if !app.contactsPath.isEmpty { app.contactsPath.removeLast() }
            case .appointments: if !app.appointmentsPath.isEmpty { app.appointmentsPath.removeLast() }
            case .reports: if !app.reportsPath.isEmpty { app.reportsPath.removeLast() }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.left")
                    .font(.system(size: 13, weight: .medium))
                Text(app.tab.label)
                    .font(VMFont.medium(14))
            }
            .foregroundStyle(c.text)
            .padding(.horizontal, 12)
            .frame(height: VMSize.control)
            .vmCard(c, radius: VMRadius.control)
        }
        .buttonStyle(.plain)
    }

    private var profileCard: some View {
        VMSection(title: S.Account.profileHeading, subtitle: S.Account.profileHint) {
            VStack(alignment: .leading, spacing: VMSpace.md) {
                field(S.Account.displayName, MockData.userDisplayName)
                field(S.Account.email, MockData.userEmail)
            }
        }
    }

    private var passwordCard: some View {
        VMSection(title: S.Account.Password.title, subtitle: S.Account.Password.description) {
            VStack(alignment: .leading, spacing: VMSpace.md) {
                labelled(S.Account.Password.current) {
                    VMTextField(placeholder: "", text: $currentPassword, secure: true)
                }
                labelled(S.Account.Password.new) {
                    VMTextField(placeholder: "", text: $newPassword, secure: true)
                }
                labelled(S.Account.Password.confirm) {
                    VMTextField(placeholder: "", text: $newPassword2, secure: true)
                }

                if let passwordError {
                    Text(passwordError)
                        .font(VMFont.sm)
                        .foregroundStyle(c.danger)
                }
                if passwordOk {
                    Text("Şifre değiştirildi (mockup: sunucuya gitmez).")
                        .font(VMFont.sm)
                        .foregroundStyle(c.success)
                }

                VMButton(title: S.Account.Password.submit) { submitPassword() }
            }
        }
    }

    private var themeCard: some View {
        VMSection(title: S.Account.themeHeading, subtitle: S.Account.themeHint) {
            Button {
                storedTheme = isDark ? VMTheme.light.rawValue : VMTheme.dark.rawValue
            } label: {
                HStack(spacing: VMSpace.sm) {
                    Image(systemName: isDark ? "sun.max" : "moon")
                        .font(.system(size: 15))
                    Text(isDark ? S.Theme.light : S.Theme.dark)
                        .font(VMFont.medium(14))
                    Spacer(minLength: 0)
                }
                .foregroundStyle(c.textMuted)
                .padding(.horizontal, 12)
                .frame(height: VMSize.control)
                .frame(maxWidth: 280)
                .vmCard(c, radius: VMRadius.control)
            }
            .buttonStyle(.plain)
        }
    }

    private var notificationsCard: some View {
        VMSection(title: S.Account.notificationsHeading) {
            Text(S.Account.notificationsSoon)
                .font(VMFont.sm)
                .foregroundStyle(c.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func field(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(VMFont.xs)
                .foregroundStyle(c.textMuted)
            Text(value)
                .font(VMFont.sm)
                .foregroundStyle(c.text)
        }
    }

    private func labelled<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(VMFont.xs)
                .foregroundStyle(c.textMuted)
            content()
        }
    }

    private func submitPassword() {
        passwordOk = false
        guard newPassword == newPassword2 else {
            passwordError = S.Account.Password.mismatch
            return
        }
        guard newPassword.count >= 8 else {
            passwordError = S.Account.Password.tooShort
            return
        }
        passwordError = nil
        passwordOk = true
        currentPassword = ""
        newPassword = ""
        newPassword2 = ""
    }
}
