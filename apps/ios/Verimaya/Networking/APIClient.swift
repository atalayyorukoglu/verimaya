import Foundation

/// Standart hata gövdesi: `{ error: { code, message }, request_id }`.
struct APIErrorBody: Decodable {
    struct Inner: Decodable {
        let code: String
        let message: String
    }
    let error: Inner
    let requestId: String?
}

enum APIError: LocalizedError, Equatable {
    case badURL
    case invalidResponse
    case decoding(String)
    /// Sunucuya ulaşılamadı: zaman aşımı, bağlantı yok, sunucu kapalı/dağıtımda.
    case unreachable
    case http(status: Int, code: String?, message: String?)

    var errorDescription: String? {
        switch self {
        case .badURL:
            return "Geçersiz API adresi"
        case .invalidResponse:
            return "Sunucudan geçersiz yanıt"
        case .unreachable:
            // Arşiv dersi #6: sunucu dağıtımdayken giriş ekranı 60 sn donuk kalmıştı.
            // Tek ve anlaşılır mesaj; teknik ayrıntı kullanıcıya gösterilmez.
            return "Sunucuya ulaşılamıyor. Bağlantını kontrol et; sunucu bakımda olabilir."
        case .decoding:
            return "Yanıt çözümlenemedi"
        case let .http(status, _, message):
            if let message, !message.isEmpty { return message }
            switch status {
            case 401: return "Oturum gerekli. Lütfen tekrar giriş yapın."
            case 403: return "Bu işlem için yetkiniz yok."
            case 404: return "Kayıt bulunamadı."
            default: return "İstek başarısız (HTTP \(status))."
            }
        }
    }

    var code: String? {
        if case let .http(_, code, _) = self { return code }
        return nil
    }

    var status: Int? {
        if case let .http(status, _, _) = self { return status }
        return nil
    }

    /// 401 → oturumu düşür, giriş ekranına dön.
    var isUnauthorized: Bool { status == 401 }
}

enum HTTPMethod: String {
    case GET, POST, PATCH, PUT, DELETE
}

/*
 Ağ katmanı. Bütün yollar `AppConfig.apiBaseURL` köküne görelidir ve otomatik
 olarak `v1/` ön ekini alır.

 - Jeton varsa `Authorization: Bearer <token>` gönderilir (better-auth oturum
   jetonu ya da `vk_` API anahtarı).
 - Gövde/yanıt snake_case ↔ camelCase dönüşümü `keyEncodingStrategy` /
   `keyDecodingStrategy` ile yapılır.
 - Mutasyonlarda `Idempotency-Key` (AGENTS.md ilke 3).
 - Zaman aşımı: istek 20 sn, kaynak 30 sn, `waitsForConnectivity = false`.
   Varsayılan 60 sn'dir ve kullanıcıyı ekranda kilitli bırakır.
*/
actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private var accessToken: String?
    /// 401 alındığında haber verilir; kabuk oturumu kapatıp giriş ekranına döner.
    private var onUnauthorized: (@Sendable () -> Void)?

    init(session: URLSession = APIClient.defaultSession) {
        self.session = session
    }

    static let defaultSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 30
        config.waitsForConnectivity = false
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: config)
    }()

    func setAccessToken(_ token: String?) {
        accessToken = token
    }

    func setUnauthorizedHandler(_ handler: (@Sendable () -> Void)?) {
        onUnauthorized = handler
    }

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()

    // MARK: Tipli yardımcılar

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        let (data, _) = try await send(.GET, path, query: query, body: Optional<Never>.none)
        return try decode(T.self, data)
    }

    func post<T: Decodable, B: Encodable>(
        _ path: String,
        body: B,
        idempotencyKey: String? = UUID().uuidString
    ) async throws -> T {
        let (data, _) = try await send(.POST, path, body: body, idempotencyKey: idempotencyKey)
        return try decode(T.self, data)
    }

    func patch<T: Decodable, B: Encodable>(
        _ path: String,
        body: B,
        idempotencyKey: String? = UUID().uuidString
    ) async throws -> T {
        let (data, _) = try await send(.PATCH, path, body: body, idempotencyKey: idempotencyKey)
        return try decode(T.self, data)
    }

    func delete(_ path: String, idempotencyKey: String? = UUID().uuidString) async throws {
        _ = try await send(.DELETE, path, body: Optional<Never>.none, idempotencyKey: idempotencyKey)
    }

    // MARK: Çekirdek istek

    @discardableResult
    private func send<B: Encodable>(
        _ method: HTTPMethod,
        _ path: String,
        query: [URLQueryItem] = [],
        body: B? = nil,
        idempotencyKey: String? = nil
    ) async throws -> (data: Data, response: HTTPURLResponse) {
        let trimmed = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let normalized = trimmed.hasPrefix("v1/") ? trimmed : "v1/" + trimmed

        var components = URLComponents(
            url: AppConfig.apiBaseURL.appendingPathComponent(normalized),
            resolvingAgainstBaseURL: false
        )
        if !query.isEmpty { components?.queryItems = query }
        guard let url = components?.url else { throw APIError.badURL }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        if let idempotencyKey, method != .GET {
            request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try APIClient.encoder.encode(body)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError {
            throw APIError.from(error)
        }

        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let parsed = try? APIClient.decoder.decode(APIErrorBody.self, from: data)
            if http.statusCode == 401 { onUnauthorized?() }
            throw APIError.http(
                status: http.statusCode,
                code: parsed?.error.code,
                message: parsed?.error.message
            )
        }
        return (data, http)
    }

    private func decode<T: Decodable>(_ type: T.Type, _ data: Data) throws -> T {
        if data.isEmpty, let empty = EmptyResponse() as? T { return empty }
        do {
            return try APIClient.decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(String(describing: error))
        }
    }
}

extension APIError {
    /// `URLError` → tek anlaşılır mesaj. Ayrım kullanıcı için anlamlı değil.
    static func from(_ error: URLError) -> APIError {
        switch error.code {
        case .timedOut, .cannotConnectToHost, .cannotFindHost,
             .networkConnectionLost, .notConnectedToInternet,
             .dnsLookupFailed, .secureConnectionFailed, .badServerResponse:
            return .unreachable
        default:
            return .http(status: -1, code: "network", message: error.localizedDescription)
        }
    }

    /// Herhangi bir hatayı kullanıcıya gösterilecek metne çevirir.
    static func message(from error: Error) -> String {
        if let apiError = error as? APIError { return apiError.errorDescription ?? "Bilinmeyen hata" }
        if let authError = error as? AuthError { return authError.errorDescription ?? "Bilinmeyen hata" }
        if let urlError = error as? URLError { return APIError.from(urlError).errorDescription ?? "Bilinmeyen hata" }
        return error.localizedDescription
    }
}

/// Gövdesiz yanıt.
struct EmptyResponse: Decodable {
    init() {}
    init(from decoder: Decoder) throws { }
}

/// Gövdesiz POST için boş JSON nesnesi.
struct EmptyBody: Encodable {
    init() {}
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: DummyKey.self)
        _ = container
    }
    private struct DummyKey: CodingKey {
        var stringValue: String { "" }
        var intValue: Int? { nil }
        init?(stringValue: String) { nil }
        init?(intValue: Int) { nil }
    }
}
