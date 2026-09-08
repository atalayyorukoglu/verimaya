import SwiftUI

/*
 `apps/web/src/routes/account/+page.svelte` — mobil hâl, gerçek veriyle.

 Kartlar: Profil (`GET /v1/me`), Organizasyon (birden çoksa değiştirici),
 Tema, Bildirim tercihleri, Çıkış.

 Şifre değiştirme kartı bu turda KONMADI: better-auth `change-password` ucu ayrı
 bir akış (mevcut şifre + diğer oturumları kapatma) ve mockup'taki hâli sunucuya
 gitmiyordu. Çalışmayan form yerine yokluk (arşiv dersi #8); README'de yazılı.
*/
struct AccountView: View {
    @Environment(\.palette) private var c
    @Environment(AppState.self) private var app
    @Environment(SessionStore.self) private var session

    @Binding var storedTheme: String

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
                if session.organizations.count > 1 { organizationCard }
                themeCard
                notificationsCard
                signOutCard
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
                field(S.Account.displayName, session.displayName.isEmpty ? "—" : session.displayName)
                field(S.Account.email, session.email.isEmpty ? "—" : session.email)
                field("Organizasyon", session.tenantName.isEmpty ? "—" : session.tenantName)
                if let role = session.me?.role {
                    field("Rol", role)
                }
            }
            .accessibilityIdentifier("account.profile")
        }
    }

    private var organizationCard: some View {
        VMSection(title: S.Shell.orgSwitch) {
            VStack(spacing: VMSpace.sm) {
                ForEach(session.organizations) { org in
                    Button {
                        Task { await session.switchOrganization(org.id) }
                    } label: {
                        HStack {
                            Text(org.name)
                                .font(VMFont.sm)
                                .foregroundStyle(c.text)
                            Spacer()
                            if org.id == session.me?.tenantId {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(c.brand)
                            }
                        }
                        .padding(.horizontal, 12)
                        .frame(height: VMSize.control)
                        .vmCard(c, radius: VMRadius.control)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
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

    private var signOutCard: some View {
        VMSection {
            VMButton(title: S.Shell.signOut, variant: .outline, fullWidth: true) {
                Task { await session.signOut() }
            }
            .accessibilityIdentifier("account.signOut")
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
}
