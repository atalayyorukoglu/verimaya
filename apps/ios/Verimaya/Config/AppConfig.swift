import Foundation

/// App-wide configuration. API base is overridable via the `VERIMAYA_API_URL`
/// environment variable (scheme env) so we can point at localhost or prod.
enum AppConfig {
  /// Verimaya REST API root. All paths are prefixed with `v1/` at call sites.
  ///
  /// Sira: `VERIMAYA_API_URL` ortam degiskeni (Xcode scheme / test kosucusu) →
  /// Info.plist'teki `VerimayaAPIURL` (derlemeye gomulu) → localhost.
  /// Ortam degiskeni yalniz Xcode'dan baslatildiginda vardir; ana ekrandan
  /// acilan uygulama Info.plist degerini kullanir.
  static let apiBaseURL: URL = {
    let candidates = [
      ProcessInfo.processInfo.environment["VERIMAYA_API_URL"],
      Bundle.main.object(forInfoDictionaryKey: "VerimayaAPIURL") as? String,
      "http://localhost:3000"
    ]
    for candidate in candidates {
      guard let trimmed = candidate?.trimmingCharacters(in: .whitespacesAndNewlines),
            !trimmed.isEmpty,
            !trimmed.hasPrefix("$("),          // cozulmemis derleme degiskeni
            let url = URL(string: trimmed),
            url.scheme != nil
      else { continue }
      return url
    }
    return URL(string: "http://localhost:3000")!
  }()

  /// Origin sent to better-auth (`/v1/auth/*`). Must be listed in the API's
  /// `TRUSTED_ORIGINS`.
  static let authOrigin = "verimaya://ios"
}
