import Foundation
import Observation

/*
 Oturum durumu — uygulamanın tek kimlik kaynağı.

 İki giriş yolu var:
   1. **better-auth e-posta/şifre** (birincil): sign-in → jeton `set-auth-token`
      başlığından → organizasyon listesi → aktif organizasyon → `/v1/me`.
   2. **API anahtarı** (`vk_` ile başlar, yedek yol): doğrudan Bearer olarak
      kullanılır, `/v1/contacts?limit=1` ile doğrulanır.

 Jeton Keychain'de saklanır; açılışta okunup `/v1/me` ile sınanır.
*/
@Observable
@MainActor
final class SessionStore {
    enum Phase: Equatable {
        /// Açılışta saklı jeton sınanıyor.
        case restoring
        case signedOut
        case signedIn
    }

    enum TokenKind: String {
        case session
        case apiKey
    }

    private(set) var phase: Phase = .restoring
    private(set) var me: Me?
    private(set) var tenant: Tenant?
    private(set) var organizations: [MeOrganization] = []

    var signInError: String?
    var isSigningIn = false

    private let client: APIClient

    init(client: APIClient = .shared) {
        self.client = client
    }

    var displayName: String { me?.displayName ?? "" }
    var email: String { me?.email ?? "" }
    var tenantName: String { tenant?.name ?? "" }
    var baseCurrency: String { tenant?.baseCurrency ?? "TRY" }

    // MARK: Açılış

    /// Saklı jetonu yükleyip doğrular. Jeton yoksa ya da geçersizse giriş ekranı.
    func restore() async {
        await client.setUnauthorizedHandler { [weak self] in
            Task { @MainActor [weak self] in await self?.handleUnauthorized() }
        }

        guard let token = Keychain.get(Keychain.Key.accessToken), !token.isEmpty else {
            phase = .signedOut
            return
        }
        await client.setAccessToken(token)
        do {
            try await loadIdentity()
            phase = .signedIn
        } catch {
            // Jeton süresi dolmuş / geçersiz → sessizce giriş ekranına.
            // Sunucuya ulaşılamıyorsa da giriş ekranı gösterilir; kullanıcı
            // orada hatayı görüp yeniden dener (ekran donuk kalmaz).
            Keychain.delete(Keychain.Key.accessToken)
            await client.setAccessToken(nil)
            if case APIError.unreachable = error {
                signInError = APIError.message(from: error)
            }
            phase = .signedOut
        }
    }

    // MARK: Giriş

    func signIn(email: String, password: String) async {
        let trimmedEmail = email.trimmed
        guard !trimmedEmail.isEmpty, !password.isEmpty else {
            signInError = "E-posta ve şifre gerekli."
            return
        }
        isSigningIn = true
        signInError = nil
        defer { isSigningIn = false }

        do {
            let result = try await AuthAPI.signInEmail(email: trimmedEmail, password: password)
            try await activateSession(token: result.token)
        } catch {
            signInError = APIError.message(from: error)
            await clearToken()
        }
    }

    /// Yedek yol: `vk_` ile başlayan API anahtarı. Doğrulama için en ucuz uç
    /// (`/v1/contacts?limit=1`) çağrılır — anahtar geçersizse 401 döner.
    func signIn(apiKey: String) async {
        let key = apiKey.trimmed
        guard key.hasPrefix("vk_") else {
            signInError = "API anahtarı `vk_` ile başlamalı."
            return
        }
        isSigningIn = true
        signInError = nil
        defer { isSigningIn = false }

        await client.setAccessToken(key)
        do {
            _ = try await client.listContacts(limit: 1)
            Keychain.set(key, for: Keychain.Key.accessToken)
            Keychain.set(TokenKind.apiKey.rawValue, for: Keychain.Key.tokenKind)
            try await loadIdentity()
            phase = .signedIn
        } catch {
            signInError = APIError.message(from: error)
            await clearToken()
        }
    }

    /// Jetonu etkinleştirir: organizasyon seçimi + kimlik yükleme.
    private func activateSession(token: String) async throws {
        // Organizasyon seçimi better-auth tarafında; `/v1/me` bunu tenant olarak okur.
        let orgs = try await AuthAPI.listOrganizations(token: token)
        organizations = orgs
        if let first = orgs.first {
            try await AuthAPI.setActiveOrganization(token: token, organizationId: first.id)
        }

        await client.setAccessToken(token)
        Keychain.set(token, for: Keychain.Key.accessToken)
        Keychain.set(TokenKind.session.rawValue, for: Keychain.Key.tokenKind)

        try await loadIdentity()
        phase = .signedIn
    }

    /// Birden çok organizasyonu olan kullanıcı için değiştirme.
    func switchOrganization(_ organizationId: String) async {
        guard let token = Keychain.get(Keychain.Key.accessToken),
              Keychain.get(Keychain.Key.tokenKind) != TokenKind.apiKey.rawValue else { return }
        do {
            try await AuthAPI.setActiveOrganization(token: token, organizationId: organizationId)
            try await loadIdentity()
        } catch {
            signInError = APIError.message(from: error)
        }
    }

    private func loadIdentity() async throws {
        // `/v1/me` DÜZ nesnedir (arşiv dersi #4) — `user`/`session` sarmalayıcısı yok.
        me = try await client.me()
        // Kiracı bilgisi (baz para birimi, saat dilimi) ayrı uçtan; başarısız
        // olursa giriş yine de geçerlidir, varsayılanlarla devam edilir.
        tenant = try? await client.currentTenant()
        if organizations.isEmpty {
            organizations = (try? await client.listMyOrganizations()) ?? []
        }
    }

    // MARK: Çıkış

    func signOut() async {
        if let token = Keychain.get(Keychain.Key.accessToken),
           Keychain.get(Keychain.Key.tokenKind) != TokenKind.apiKey.rawValue {
            await AuthAPI.signOut(token: token)
        }
        await clearToken()
        me = nil
        tenant = nil
        organizations = []
        phase = .signedOut
    }

    /// 401: jeton düştü — oturumu kapat, kullanıcı yeniden girsin.
    private func handleUnauthorized() async {
        guard phase == .signedIn else { return }
        await clearToken()
        me = nil
        phase = .signedOut
        signInError = "Oturum süresi doldu. Lütfen tekrar giriş yapın."
    }

    private func clearToken() async {
        Keychain.delete(Keychain.Key.accessToken)
        Keychain.delete(Keychain.Key.tokenKind)
        await client.setAccessToken(nil)
    }
}
