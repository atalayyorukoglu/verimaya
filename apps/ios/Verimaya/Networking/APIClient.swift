import Foundation

/// Standard API error body: { error: { code, message }, request_id }.
struct APIErrorBody: Decodable {
  struct Inner: Decodable { let code: String; let message: String }
  let error: Inner
  let requestId: String?
}

enum APIError: LocalizedError {
  case badURL
  case invalidResponse
  case decoding(Error)
  /// HTTP status + parsed standard error body (code/message) when available.
  case http(status: Int, code: String?, message: String?)

  var errorDescription: String? {
    switch self {
    case .badURL: return "Geçersiz API adresi"
    case .invalidResponse: return "Sunucudan geçersiz yanıt"
    case .decoding: return "Yanıt çözümlenemedi"
    case let .http(status, _, message):
      if let message, !message.isEmpty { return message }
      switch status {
      case 401: return "Oturum gerekli. Lütfen giriş yapın."
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
}

private enum HTTPMethod: String { case GET, POST, PATCH, PUT, DELETE }

/// Thin networking layer. All paths are relative to `AppConfig.apiBaseURL` and
/// are automatically prefixed with `v1/`. Sends `Authorization: Bearer <token>`
/// when an access token is set (better-auth session token or `vk_...` API key).
@MainActor
final class APIClient: ObservableObject {
  static let shared = APIClient()

  private let session: URLSession
  private(set) var accessToken: String?

  init(session: URLSession = .shared) { self.session = session }

  func setAccessToken(_ token: String?) { accessToken = token }

  static let decoder: JSONDecoder = {
    let d = JSONDecoder()
    d.keyDecodingStrategy = .convertFromSnakeCase
    return d
  }()

  static let encoder: JSONEncoder = {
    let e = JSONEncoder()
    e.keyEncodingStrategy = .convertToSnakeCase
    return e
  }()

  // MARK: Public typed helpers

  func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
    let (data, _) = try await send(.GET, path, query: query, body: Optional<Int>.none)
    return try decode(T.self, data)
  }

  func post<T: Decodable, B: Encodable>(
    _ path: String, body: B, idempotencyKey: String? = UUID().uuidString
  ) async throws -> T {
    let (data, _) = try await send(.POST, path, body: body, idempotencyKey: idempotencyKey)
    return try decode(T.self, data)
  }

  func patch<T: Decodable, B: Encodable>(
    _ path: String, body: B, idempotencyKey: String? = UUID().uuidString
  ) async throws -> T {
    let (data, _) = try await send(.PATCH, path, body: body, idempotencyKey: idempotencyKey)
    return try decode(T.self, data)
  }

  func delete(_ path: String, idempotencyKey: String? = UUID().uuidString) async throws {
    _ = try await send(.DELETE, path, body: Optional<Int>.none, idempotencyKey: idempotencyKey)
  }

  /// POST that also returns the raw HTTP response (needed for the better-auth
  /// `set-auth-token` header on sign-in).
  func postCapturingResponse<B: Encodable>(
    _ path: String, body: B
  ) async throws -> (data: Data, response: HTTPURLResponse) {
    try await send(.POST, path, body: body)
  }

  // MARK: Core request

  @discardableResult
  private func send<B: Encodable>(
    _ method: HTTPMethod,
    _ path: String,
    query: [URLQueryItem] = [],
    body: B? = nil,
    idempotencyKey: String? = nil
  ) async throws -> (data: Data, response: HTTPURLResponse) {
    let normalized = path.hasPrefix("v1/") ? path : "v1/" + path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    var components = URLComponents(
      url: AppConfig.apiBaseURL.appendingPathComponent(normalized),
      resolvingAgainstBaseURL: false
    )
    if !query.isEmpty { components?.queryItems = query }
    guard let url = components?.url else { throw APIError.badURL }

    var request = URLRequest(url: url)
    request.httpMethod = method.rawValue
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if let accessToken { request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization") }
    if let idempotencyKey, method != .GET {
      request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key")
    }
    if let body {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try APIClient.encoder.encode(body)
    }

    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
    guard (200..<300).contains(http.statusCode) else {
      let parsed = try? APIClient.decoder.decode(APIErrorBody.self, from: data)
      throw APIError.http(status: http.statusCode, code: parsed?.error.code, message: parsed?.error.message)
    }
    return (data, http)
  }

  private func decode<T: Decodable>(_ type: T.Type, _ data: Data) throws -> T {
    if data.isEmpty, let empty = EmptyResponse() as? T { return empty }
    do { return try APIClient.decoder.decode(T.self, from: data) }
    catch { throw APIError.decoding(error) }
  }
}

/// Placeholder for endpoints that return no body.
struct EmptyResponse: Decodable { init() {} }
