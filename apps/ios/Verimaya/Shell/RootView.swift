import SwiftUI

/*
 `apps/web/src/lib/components/AppShell.svelte` karşılığı — mobil kabuk.

 Web'deki mobil düzen (md: öncesi hâl):
   • Üst şerit `h-14` (56): marka `h-8` | dönem denetimi (esner) | arama ikonu.
   • Gövde `p-4`; altta alt menü payı.
   • Alt menü `h-14`: Finans · Kişiler · Randevular · Raporlar · Menü
     (sıra `mobileTabItems`). Aktif sekme `text-brand`.
   • "Menü" soldan çekmece açar; üstünde hesap başlığı (avatar + ad + chevron).

 Bu turda eklenen: kabuk artık OTURUM KAPISI. Jeton yoksa giriş ekranı,
 varsa panel. Açılışta saklı jeton `/v1/me` ile sınanır.
*/
struct RootView: View {
    @State private var app = AppState()
    @State private var session = SessionStore()
    @AppStorage("verimaya:theme") private var storedTheme = VMTheme.light.rawValue

    private var theme: VMTheme { VMTheme(rawValue: storedTheme) ?? .light }
    private var c: VMPalette { theme.palette }

    var body: some View {
        Group {
            switch session.phase {
            case .restoring:
                restoringView
            case .signedOut:
                LoginView()
            case .signedIn:
                panel
            }
        }
        .environment(app)
        .environment(session)
        .environment(\.palette, c)
        .preferredColorScheme(theme.colorScheme)
        .task {
            app.theme = theme
            app.applyLaunchArguments()
            await session.restore()
        }
        .onChange(of: session.tenant?.baseCurrency) { _, newValue in
            app.baseCurrency = newValue ?? "TRY"
        }
    }

    /// Açılışta saklı jeton sınanırken. Zaman aşımı 20 sn olduğu için bu ekran
    /// en fazla o kadar sürer — sonsuza kadar dönmez (arşiv dersi #6).
    private var restoringView: some View {
        VStack(spacing: VMSpace.md) {
            BrandMark()
                .frame(width: 48, height: 48)
            ProgressView()
                .tint(c.brand)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(c.bg)
    }

    // MARK: Panel

    private var panel: some View {
        ZStack(alignment: .leading) {
            c.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                Divider().overlay(c.border)
                content
                bottomNav
            }

            if app.menuOpen {
                Color.black.opacity(0.6)
                    .ignoresSafeArea()
                    .onTapGesture { app.closeMenu() }
                    .accessibilityLabel(S.Shell.ariaCloseMenu)
                    .transition(.opacity)

                MenuDrawer()
                    .transition(.move(edge: .leading))
            }
        }
        .animation(.easeOut(duration: 0.2), value: app.menuOpen)
        .sheet(isPresented: Binding(get: { app.searchOpen }, set: { app.searchOpen = $0 })) {
            SearchSheet()
                .environment(app)
                .environment(\.palette, c)
        }
        .sheet(isPresented: Binding(get: { app.supportOpen }, set: { app.supportOpen = $0 })) {
            SupportSheet()
                .environment(app)
                .environment(\.palette, c)
        }
    }

    // MARK: Üst şerit

    private var header: some View {
        @Bindable var app = app

        return HStack(spacing: VMSpace.sm) {
            BrandMark()
                .frame(width: 32, height: 32)
                .accessibilityLabel(S.Shell.ariaHome)

            if app.showsPeriodControl, app.activePeriod != nil {
                PeriodPickerBar(period: Binding(
                    get: { app.activePeriod ?? Period(key: .tum) },
                    set: { app.activePeriod = $0 }
                ))
                .frame(maxWidth: .infinity)
            } else {
                Spacer(minLength: 0)
            }

            Button {
                app.searchOpen = true
            } label: {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 20, weight: .regular))
                    .foregroundStyle(c.textMuted)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(S.Command.aria)
        }
        .padding(.horizontal, VMSpace.lg)
        .frame(height: VMSize.chrome)
        .background(c.bg)
    }

    // MARK: Gövde

    @ViewBuilder
    private var content: some View {
        @Bindable var app = app

        switch app.tab {
        case .finance:
            NavigationStack(path: $app.financePath) { tabRoot(FinanceView()) }
        case .contacts:
            NavigationStack(path: $app.contactsPath) { tabRoot(ContactsView()) }
        case .appointments:
            NavigationStack(path: $app.appointmentsPath) { tabRoot(AppointmentsView()) }
        case .reports:
            NavigationStack(path: $app.reportsPath) { tabRoot(ReportsView()) }
        }
    }

    private func tabRoot<V: View>(_ view: V) -> some View {
        view
            .navigationDestination(for: VMRoute.self) { route in
                Group {
                    switch route {
                    case .aiTransaction: AITransactionView()
                    case .account: AccountView(storedTheme: $storedTheme)
                    }
                }
                .toolbar(.hidden, for: .navigationBar)
            }
            .toolbar(.hidden, for: .navigationBar)
    }

    // MARK: Alt menü

    private var bottomNav: some View {
        VStack(spacing: 0) {
            Divider().overlay(c.border)
            HStack(spacing: 0) {
                ForEach(VMTab.allCases) { tab in
                    tabButton(tab)
                }
                menuButton
            }
            .frame(height: VMSize.chrome)
        }
        .background(c.surface)
        .accessibilityLabel(S.Shell.ariaBottomNav)
    }

    private func tabButton(_ tab: VMTab) -> some View {
        let active = app.tab == tab
        return Button {
            app.go(tab)
        } label: {
            VStack(spacing: 2) {
                Image(systemName: tab.symbol)
                    .font(.system(size: 18, weight: .regular))
                Text(tab.label)
                    .font(VMFont.xxs)
                    .lineLimit(1)
            }
            .foregroundStyle(active ? c.brand : c.textMuted)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("tab.\(tab.rawValue)")
        .accessibilityAddTraits(active ? [.isSelected] : [])
    }

    private var menuButton: some View {
        Button {
            app.menuOpen.toggle()
        } label: {
            VStack(spacing: 2) {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 18, weight: .regular))
                Text(S.Shell.menu)
                    .font(VMFont.xxs)
            }
            .foregroundStyle(app.menuOpen ? c.brand : c.textMuted)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("tab.menu")
        .accessibilityLabel(S.Shell.ariaMenu)
    }
}

// MARK: - Marka

/// `BrandMark.svelte` yerine sade bir işaret: brand zeminde "V".
struct BrandMark: View {
    @Environment(\.palette) private var c

    var body: some View {
        RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous)
            .fill(c.brand)
            .overlay(
                Text("V")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(c.onBrand)
            )
    }
}

// MARK: - Menü çekmecesi

/// Web'deki mobil `aside` — hesap başlığı + gruplu nav + footer.
struct MenuDrawer: View {
    @Environment(\.palette) private var c
    @Environment(AppState.self) private var app
    @Environment(SessionStore.self) private var session

    var body: some View {
        @Bindable var app = app

        return VStack(spacing: 0) {
            accountHeader

            Divider().overlay(c.border)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(S.Nav.groupProducts)
                        .font(VMFont.semibold(12))
                        .foregroundStyle(c.textMuted)
                        .padding(.horizontal, VMSpace.md)
                        .padding(.top, VMSpace.lg)
                        .padding(.bottom, 6)

                    ForEach(VMTab.allCases) { tab in
                        navRow(tab)
                    }
                }
            }

            Divider().overlay(c.border)

            HStack {
                Spacer()
                VStack(spacing: 2) {
                    Text(session.email)
                        .font(VMFont.xs)
                        .foregroundStyle(c.textMuted)
                        .lineLimit(1)
                    Text("Verimaya · v0.2.0")
                        .font(VMFont.xs)
                        .foregroundStyle(c.textFaint)
                }
                Spacer()
            }
            .padding(.vertical, VMSpace.md)
        }
        .frame(width: 300)
        .frame(maxHeight: .infinity)
        .background(c.bg)
        .overlay(alignment: .trailing) {
            Rectangle().fill(c.border).frame(width: 1)
        }
        .ignoresSafeArea(edges: .bottom)
    }

    private var accountHeader: some View {
        @Bindable var app = app

        return VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button {
                    app.accountMenuOpen.toggle()
                } label: {
                    HStack(spacing: 10) {
                        Text(VMFormat.initials(session.displayName))
                            .font(VMFont.semibold(12))
                            .foregroundStyle(c.text)
                            .frame(width: 36, height: 36)
                            .background(c.surface2)
                            .clipShape(Circle())
                            .overlay(Circle().stroke(c.border, lineWidth: 1))
                        Text(session.displayName.split(separator: " ").first.map(String.init) ?? "…")
                            .font(VMFont.medium(16))
                            .foregroundStyle(c.text)
                            .lineLimit(1)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(c.textMuted)
                            .rotationEffect(.degrees(app.accountMenuOpen ? 180 : 0))
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(S.Shell.ariaAccountMenu)

                Button {
                    app.closeMenu()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(c.textMuted)
                        .frame(width: 40, height: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(S.Shell.ariaCloseMenu)
            }
            .padding(.horizontal, VMSpace.md)
            .frame(height: 64)

            if app.accountMenuOpen {
                AccountMenu()
            }
        }
    }

    private func navRow(_ tab: VMTab) -> some View {
        let active = app.tab == tab
        return Button {
            app.go(tab)
        } label: {
            HStack(spacing: VMSpace.md) {
                Image(systemName: tab.symbol)
                    .font(.system(size: 18))
                    .frame(width: 22)
                Text(tab.label)
                    .font(VMFont.medium(16))
                Spacer(minLength: 0)
            }
            .foregroundStyle(active ? c.brandText : c.textMuted)
            .padding(.horizontal, VMSpace.md)
            .frame(height: 48)
            .background(active ? c.brandSubtle : .clear)
            .clipShape(RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, VMSpace.md)
        .padding(.bottom, 4)
    }
}

/// Hesap menüsü — web'deki açılır menünün mobil (`spacious`) hâli.
/// "Yenilikler" yok (changelog ekranı yazılmadı); organizasyon değiştirme
/// Profil ayarları kartında (birden çok organizasyon varsa).
struct AccountMenu: View {
    @Environment(\.palette) private var c
    @Environment(AppState.self) private var app
    @Environment(SessionStore.self) private var session
    @AppStorage("verimaya:theme") private var storedTheme = VMTheme.light.rawValue

    private var isDark: Bool { storedTheme == VMTheme.dark.rawValue }

    var body: some View {
        @Bindable var app = app

        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Text(session.displayName)
                    .font(VMFont.medium(16))
                    .foregroundStyle(c.text)
                Text(session.email)
                    .font(VMFont.sm)
                    .foregroundStyle(c.textFaint)
                    .lineLimit(1)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)

            Divider().overlay(c.border)

            menuItem(S.Account.nav, icon: "person.crop.circle") {
                app.closeMenu()
                app.push(.account)
            }
            menuItem(isDark ? S.Theme.light : S.Theme.dark,
                     icon: isDark ? "sun.max" : "moon") {
                storedTheme = isDark ? VMTheme.light.rawValue : VMTheme.dark.rawValue
            }
            menuItem(S.Shell.supportTitle, icon: "lifepreserver") {
                app.closeMenu()
                app.supportOpen = true
            }
            menuItem(S.Shell.signOut, icon: "rectangle.portrait.and.arrow.right", tone: .danger) {
                app.closeMenu()
                Task { await session.signOut() }
            }
        }
        .background(c.surface)
        .clipShape(RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous)
                .stroke(c.border, lineWidth: 1)
        )
        .padding(.horizontal, VMSpace.sm)
        .padding(.bottom, VMSpace.sm)
    }

    private enum ItemTone { case normal, danger }

    private func menuItem(
        _ title: String,
        icon: String,
        tone: ItemTone = .normal,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: VMSpace.sm) {
                Image(systemName: icon)
                    .font(.system(size: 15))
                    .frame(width: 20)
                Text(title)
                    .font(VMFont.base)
                Spacer(minLength: 0)
            }
            .foregroundStyle(tone == .danger ? c.danger : c.textMuted)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Destek penceresi — web'deki `Dialog` karşılığı.
struct SupportSheet: View {
    @Environment(\.palette) private var c
    @Environment(AppState.self) private var app

    var body: some View {
        @Bindable var app = app

        return VStack(alignment: .leading, spacing: VMSpace.md) {
            Text(S.Shell.supportTitle)
                .font(VMFont.semibold(18))
                .foregroundStyle(c.text)
            Text(S.Shell.supportDescription)
                .font(VMFont.sm)
                .foregroundStyle(c.textMuted)
            Text(S.Shell.supportBody)
                .font(VMFont.sm)
                .foregroundStyle(c.textMuted)
            Text(S.Shell.supportEmail)
                .font(VMFont.medium(14))
                .foregroundStyle(c.brand)

            Spacer(minLength: 0)

            VMButton(title: S.Shell.supportClose, fullWidth: true) {
                app.supportOpen = false
            }
        }
        .padding(VMSpace.lg)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(c.bg)
        .presentationDetents([.height(280)])
        .presentationDragIndicator(.visible)
    }
}
