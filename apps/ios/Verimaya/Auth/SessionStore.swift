import Foundation
import SwiftUI

/// Auth state + persistence. Two modes:
/// - `.session`: better-auth email/password → `set-auth-token` bearer token.
/// - `.apiKey`: pasted `vk_...` machine key (single tenant, no /me).
@MainActor
final class SessionStore: ObservableObject {
  enum Mode: String { case session, apiKey }

  @Published var isAuthenticated = false
  @Published var mode: Mode = .session
  @Published var email: String?
  @Published var name: String?
  @Published var activeOrganizationId: String?
  @Published var organizations: [Organization] = []
  @Published var statusMessage: String?
  @Published var isBusy = false

  private let kToken = "token", kMode = "mode", kEmail = "email"

  var isApiKeySession: Bool { mode == .apiKey }

  // MARK: Bootstrap
  func bootstrap() async {
    guard let token = Keychain.get(kToken), !token.isEmpty else { return }
    mode = Mode(rawValue: Keychain.get(kMode) ?? "session") ?? .session
    APIClient.shared.setAccessToken(token)
    do {
      if mode == .apiKey {
        _ = try await APIClient.shared.listPatients(limit: 1)  // validate key
        email = nil; name = "API anahtarı"
      } else {
        apply(try await APIClient.shared.me())
        organizations = (try? await AuthAPI.listOrganizations(token: token)) ?? []
      }
      isAuthenticated = true
    } catch {
      signOut()
    }
  }

  // MARK: Email / password (better-auth bearer)
  func signInEmail(email: String, password: String) async {
    isBusy = true; statusMessage = nil
    defer { isBusy = false }
    do {
      let result = try await AuthAPI.signInEmail(email: email, password: password)
      if result.twoFactorRequired {
        statusMessage = "İki adımlı doğrulama açık — şimdilik web panelinden giriş yapın."
        return
      }
      guard let token = result.token else { throw AuthError.noToken }
      APIClient.shared.setAccessToken(token)
      mode = .session

      let orgs = (try? await AuthAPI.listOrganizations(token: token)) ?? []
      organizations = orgs
      if let first = orgs.first {
        try? await AuthAPI.setActive(token: token, organizationId: first.id)
      }
      let me = try await APIClient.shared.me()
      apply(me)
      persist(token: token, email: me.user.email)
      isAuthenticated = true
    } catch {
      statusMessage = message(from: error)
    }
  }

  // MARK: API key fallback
  func signInApiKey(_ raw: String) async {
    let key = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard key.hasPrefix("vk_") else {
      statusMessage = "API anahtarı vk_ ile başlamalı."
      return
    }
    isBusy = true; statusMessage = nil
    defer { isBusy = false }
    APIClient.shared.setAccessToken(key)
    do {
      _ = try await APIClient.shared.listPatients(limit: 1)  // validate against a tenant endpoint
      mode = .apiKey
      email = nil; name = "API anahtarı"
      persist(token: key, email: nil)
      isAuthenticated = true
    } catch {
      APIClient.shared.setAccessToken(nil)
      statusMessage = "Anahtar doğrulanamadı: \(message(from: error))"
    }
  }

  // MARK: Org switch (session mode)
  func selectOrganization(_ org: Organization) async {
    guard mode == .session, let token = Keychain.get(kToken) else { return }
    do {
      try await AuthAPI.setActive(token: token, organizationId: org.id)
      apply(try await APIClient.shared.me())
    } catch {
      statusMessage = message(from: error)
    }
  }

  // MARK: Sign out
  func signOut() {
    Keychain.delete(kToken); Keychain.delete(kMode); Keychain.delete(kEmail)
    APIClient.shared.setAccessToken(nil)
    isAuthenticated = false
    email = nil; name = nil; activeOrganizationId = nil
    organizations = []; mode = .session
  }

  // MARK: helpers
  private func apply(_ me: MeResponse) {
    email = me.user.email
    name = me.user.name
    activeOrganizationId = me.session.activeOrganizationId
  }
  private func persist(token: String, email: String?) {
    Keychain.set(token, for: kToken)
    Keychain.set(mode.rawValue, for: kMode)
    Keychain.set(email, for: kEmail)
  }
  private func message(from error: Error) -> String {
    (error as? APIError)?.errorDescription
      ?? (error as? AuthError)?.errorDescription
      ?? error.localizedDescription
  }
}
