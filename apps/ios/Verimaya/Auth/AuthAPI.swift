import Foundation

enum AuthError: LocalizedError {
    case server(String)
    case noToken
    case unreachable
    case twoFactorRequired

    var errorDescription: String? {
        switch self {
        case let .server(message): return message
        case .noToken: return "Sunucu oturum jetonu döndürmedi."
        case .unreachable:
            return "Sunucuya ulaşılamıyor. Bağlantını kontrol et; sunucu bakımda olabilir."
        case .twoFactorRequired:
            return "Bu hesapta iki adımlı doğrulama açık; şimdilik panelden giriş yapın."
        }
    }
}

/*
 better-auth uçlarına (`/v1/auth/…`) doğrudan çağrı.

 Neden `APIClient` kullanılmıyor: better-auth gövdede **camelCase** bekler
 (`organizationId`), APIClient ise snake_case'e çevirir. İki ayrı sözleşme, iki
 ayrı istemci.

 İki kritik ayrıntı (ikisi de canlı API'ye karşı doğrulandı):

 1. **Jeton `set-auth-token` YANIT BAŞLIĞINDAN** alınır. Gövdedeki `token`
    alanı kısa oturum kimliğidir ve Bearer olarak KABUL EDİLMEZ; başlıktaki
    imzalı tam değer gerekir.
 2. **`Origin: verimaya://ios` başlığı zorunlu.** better-auth durum değiştiren
    uçlarda Origin denetler; yerel isteğin tarayıcı Origin'i yoktur. Bu değer
    sunucunun `TRUSTED_ORIGINS` listesinde tanımlı olmalı, yoksa 403
    `INVALID_ORIGIN` döner.
*/
enum AuthAPI {
    struct SignInResult {
        let token: String
    }

    /// Arşiv dersi #6: zaman aşımı şart. Varsayılan 60 sn'de giriş ekranı
    /// sunucu dağıtımdayken donuk kalıyordu.
    private static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 30
        config.waitsForConnectivity = false
        return URLSession(configuration: config)
    }()

    static func signInEmail(email: String, password: String) async throws -> SignInResult {
        let (data, http) = try await request(
            "sign-in/email",
            method: "POST",
            json: ["email": email, "password": password]
        )
        try throwIfError(data, http)

        if let twoFactor = (try? JSONDecoder().decode(TwoFactorBody.self, from: data))?.twoFactorRedirect,
           twoFactor {
            throw AuthError.twoFactorRequired
        }

        guard let token = http.value(forHTTPHeaderField: "set-auth-token"),
              !token.isEmpty else {
            throw AuthError.noToken
        }
        return SignInResult(token: token)
    }

    static func listOrganizations(token: String) async throws -> [MeOrganization] {
        let (data, http) = try await request("organization/list", method: "GET", token: token)
        try throwIfError(data, http)
        if let list = try? JSONDecoder().decode([MeOrganization].self, from: data) { return list }
        if let wrapped = try? JSONDecoder().decode(OrgListWrapper.self, from: data) { return wrapped.data }
        return []
    }

    static func setActiveOrganization(token: String, organizationId: String) async throws {
        let (data, http) = try await request(
            "organization/set-active",
            method: "POST",
            json: ["organizationId": organizationId],
            token: token
        )
        try throwIfError(data, http)
    }

    static func signOut(token: String) async {
        _ = try? await request("sign-out", method: "POST", json: [:], token: token)
    }

    // MARK: İç kısımlar

    private struct TwoFactorBody: Decodable { let twoFactorRedirect: Bool? }
    private struct OrgListWrapper: Decodable { let data: [MeOrganization] }
    private struct ServerError: Decodable { let message: String? }

    private static func request(
        _ path: String,
        method: String,
        json: [String: Any]? = nil,
        token: String? = nil
    ) async throws -> (Data, HTTPURLResponse) {
        let url = AppConfig.apiBaseURL.appendingPathComponent("v1/auth/\(path)")
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(AppConfig.authOrigin, forHTTPHeaderField: "Origin")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let json {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
        }

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw AuthError.server("Geçersiz yanıt")
            }
            return (data, http)
        } catch let error as URLError {
            switch error.code {
            case .timedOut, .cannotConnectToHost, .cannotFindHost,
                 .networkConnectionLost, .notConnectedToInternet,
                 .dnsLookupFailed, .secureConnectionFailed, .badServerResponse:
                throw AuthError.unreachable
            default:
                throw error
            }
        }
    }

    private static func throwIfError(_ data: Data, _ http: HTTPURLResponse) throws {
        guard !(200..<300).contains(http.statusCode) else { return }
        let message = (try? JSONDecoder().decode(ServerError.self, from: data))?.message
        if http.statusCode == 401 || http.statusCode == 403 {
            throw AuthError.server(message ?? "E-posta veya şifre hatalı.")
        }
        throw AuthError.server(message ?? "Giriş başarısız (HTTP \(http.statusCode)).")
    }
}
