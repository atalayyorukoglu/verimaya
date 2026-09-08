import SwiftUI

/*
 Giriş ekranı.

 İki yol: e-posta/şifre (better-auth) ve `vk_` API anahtarı (yedek).

 Arşiv dersi #6: sunucu cevap vermezse ekran DONMAZ — istek 20 sn'de düşer,
 hata şeridi görünür, düğme yeniden basılabilir hâle gelir. Bu gerçekten yaşandı:
 sunucu dağıtımdayken giriş ekranı 60 sn boyunca dönen çarkla kilitli kaldı.
*/
struct LoginView: View {
    @Environment(\.palette) private var c
    @Environment(SessionStore.self) private var session

    private enum Mode: String, CaseIterable {
        case password
        case apiKey

        var label: String {
            switch self {
            case .password: return "E-posta ile"
            case .apiKey: return "API anahtarı"
            }
        }
    }

    @State private var mode: Mode = .password
    @State private var email = ""
    @State private var password = ""
    @State private var apiKey = ""

    private var canSubmit: Bool {
        if session.isSigningIn { return false }
        switch mode {
        case .password: return !email.trimmed.isEmpty && !password.isEmpty
        case .apiKey: return !apiKey.trimmed.isEmpty
        }
    }

    var body: some View {
        @Bindable var session = session

        ScrollView {
            VStack(spacing: VMSpace.lg) {
                Spacer(minLength: 48)

                BrandMark()
                    .frame(width: 56, height: 56)

                VStack(spacing: 4) {
                    Text("Verimaya")
                        .font(VMFont.semibold(22))
                        .foregroundStyle(c.text)
                    Text("Panel hesabınla giriş yap.")
                        .font(VMFont.sm)
                        .foregroundStyle(c.textMuted)
                }

                Picker("", selection: $mode) {
                    ForEach(Mode.allCases, id: \.rawValue) { item in
                        Text(item.label).tag(item)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.top, VMSpace.sm)

                VStack(spacing: VMSpace.md) {
                    switch mode {
                    case .password:
                        labelled("E-posta") {
                            VMTextField(placeholder: "ornek@firma.com", text: $email)
                                .textContentType(.emailAddress)
                                .keyboardType(.emailAddress)
                                .accessibilityIdentifier("login.email")
                        }
                        labelled("Şifre") {
                            VMTextField(placeholder: "", text: $password, secure: true)
                                .textContentType(.password)
                                .accessibilityIdentifier("login.password")
                        }
                    case .apiKey:
                        labelled("API anahtarı") {
                            VMTextField(placeholder: "vk_…", text: $apiKey, secure: true)
                                .accessibilityIdentifier("login.apiKey")
                        }
                        Text("Panel → Ayarlar → API anahtarları'ndan üretilir.")
                            .font(VMFont.xs)
                            .foregroundStyle(c.textFaint)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                if let error = session.signInError {
                    HStack(alignment: .top, spacing: VMSpace.sm) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 13))
                        Text(error)
                            .font(VMFont.sm)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .foregroundStyle(c.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(VMSpace.md)
                    .background(c.danger.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: VMRadius.card, style: .continuous))
                    .accessibilityIdentifier("login.error")
                }

                VMButton(
                    title: session.isSigningIn ? "Giriş yapılıyor…" : "Giriş yap",
                    fullWidth: true,
                    disabled: !canSubmit
                ) {
                    submit()
                }
                .accessibilityIdentifier("login.submit")

                if session.isSigningIn {
                    ProgressView()
                        .tint(c.brand)
                }

                Spacer(minLength: 24)

                Text(AppConfig.apiBaseURL.absoluteString)
                    .font(VMFont.xs)
                    .foregroundStyle(c.textFaint)
                    .accessibilityIdentifier("login.apiBase")
            }
            .padding(VMSpace.page)
            .frame(maxWidth: 420)
            .frame(maxWidth: .infinity)
        }
        .background(c.bg)
        .scrollDismissesKeyboard(.interactively)
    }

    private func labelled<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(VMFont.xs)
                .foregroundStyle(c.textMuted)
            content()
        }
    }

    private func submit() {
        Task {
            switch mode {
            case .password:
                await session.signIn(email: email, password: password)
            case .apiKey:
                await session.signIn(apiKey: apiKey)
            }
        }
    }
}
