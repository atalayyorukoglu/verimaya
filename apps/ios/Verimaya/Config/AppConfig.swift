import Foundation

/// App-wide configuration. API base is overridable via the `VERIMAYA_API_URL`
/// environment variable (scheme env) so we can point at localhost or prod.
enum AppConfig {
  /// Verimaya REST API root. All paths are prefixed with `v1/` at call sites.
  static let apiBaseURL: URL = {
    let raw = ProcessInfo.processInfo.environment["VERIMAYA_API_URL"] ?? "http://localhost:3000"
    return URL(string: raw)!
  }()

  /// Origin sent to better-auth (`/v1/auth/*`). Must be listed in the API's
  /// `TRUSTED_ORIGINS`.
  static let authOrigin = "verimaya://ios"
}
