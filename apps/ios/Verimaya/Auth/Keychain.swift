import Foundation
import Security

/// Oturum jetonu için asgari Keychain sarmalayıcısı.
/// Jeton `UserDefaults`'a değil buraya yazılır: cihaz yedeğinden okunamaz ve
/// uygulama silinene kadar kalır.
enum Keychain {
  private static let service = "com.verimaya.app"

  /// Anahtar adları — tek yerde.
  enum Key {
    static let accessToken = "access_token"
    static let tokenKind = "token_kind"
  }

  static func set(_ value: String?, for key: String) {
    guard let value, !value.isEmpty else { delete(key); return }
    let data = Data(value.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key
    ]
    SecItemDelete(query as CFDictionary)
    var add = query
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    SecItemAdd(add as CFDictionary, nil)
  }

  static func get(_ key: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var out: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
          let data = out as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  static func delete(_ key: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key
    ]
    SecItemDelete(query as CFDictionary)
  }
}
