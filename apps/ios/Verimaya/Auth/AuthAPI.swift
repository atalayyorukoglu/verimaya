import Foundation

struct Organization: Decodable, Identifiable, Hashable {
  let id: String
  let name: String
  let slug: String?
}

enum AuthError: LocalizedError {
  case server(String)
  case noToken
  var errorDescription: String? {
    switch self {
    case .server(let m): return m
    case .noToken: return "Sunucu oturum jetonu döndürmedi."
    }
  }
}

/// Direct calls to better-auth (`/v1/auth/*`). These bypass APIClient's
/// snake_case encoding because better-auth expects camelCase keys
/// (e.g. `organizationId`). The session token comes back in the
/// `set-auth-token` response header (bearer plugin).
enum AuthAPI {
  struct SignInResult { let token: String?; let twoFactorRequired: Bool }

  static func signInEmail(email: String, password: String) async throws -> SignInResult {
    let (data, http) = try await request(
      "sign-in/email", method: "POST",
      json: ["email": email, "password": password]
    )
    try throwIfError(data, http)
    let token = http.value(forHTTPHeaderField: "set-auth-token")
      ?? (try? JSONDecoder().decode(TokenBody.self, from: data))?.token
    let twoFactor = (try? JSONDecoder().decode(TwoFactorBody.self, from: data))?.twoFactorRedirect ?? false
    return SignInResult(token: token, twoFactorRequired: twoFactor)
  }

  static func listOrganizations(token: String) async throws -> [Organization] {
    let (data, http) = try await request("organization/list", method: "GET", token: token)
    try throwIfError(data, http)
    if let arr = try? JSONDecoder().decode([Organization].self, from: data) { return arr }
    if let wrapped = try? JSONDecoder().decode(OrgListWrapper.self, from: data) { return wrapped.data }
    return []
  }

  static func setActive(token: String, organizationId: String) async throws {
    let (data, http) = try await request(
      "organization/set-active", method: "POST",
      json: ["organizationId": organizationId], token: token
    )
    try throwIfError(data, http)
  }

  // MARK: internals
  private struct TokenBody: Decodable { let token: String? }
  private struct TwoFactorBody: Decodable { let twoFactorRedirect: Bool? }
  private struct OrgListWrapper: Decodable { let data: [Organization] }
  private struct ServerError: Decodable { let message: String? }

  private static func request(
    _ path: String, method: String, json: [String: Any]? = nil, token: String? = nil
  ) async throws -> (Data, HTTPURLResponse) {
    let url = AppConfig.apiBaseURL.appendingPathComponent("v1/auth/\(path)")
    var req = URLRequest(url: url)
    req.httpMethod = method
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    // better-auth enforces an Origin check on state-changing endpoints. Native
    // requests have no browser Origin, so we send a trusted custom-scheme origin
    // that must be present in the API's TRUSTED_ORIGINS.
    req.setValue(AppConfig.authOrigin, forHTTPHeaderField: "Origin")
    if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    if let json {
      req.setValue("application/json", forHTTPHeaderField: "Content-Type")
      req.httpBody = try JSONSerialization.data(withJSONObject: json)
    }
    let (data, resp) = try await URLSession.shared.data(for: req)
    guard let http = resp as? HTTPURLResponse else { throw AuthError.server("Geçersiz yanıt") }
    return (data, http)
  }

  private static func throwIfError(_ data: Data, _ http: HTTPURLResponse) throws {
    guard !(200..<300).contains(http.statusCode) else { return }
    let msg = (try? JSONDecoder().decode(ServerError.self, from: data))?.message
    throw AuthError.server(msg ?? "Giriş başarısız (HTTP \(http.statusCode)).")
  }
}
