import SwiftUI

/// Profil ayarları — web panelindeki `/account` sayfasının mobil karşılığı.
///
/// Web'de kartlar hâlinde: Profil · Tema · (şifre, bildirimler). Çıkış web'de
/// hesap menüsünde duruyor; burada da en altta kendi kartında, alt sekme
/// çubuğunun altında kalmayacak şekilde boşluk bırakılıyor.
struct SettingsView: View {
  @EnvironmentObject private var session: SessionStore
  @AppStorage("verimaya:theme") private var themeRaw = ThemePreference.system.rawValue
  @State private var confirmSignOut = false

  private var themeBinding: Binding<ThemePreference> {
    Binding(
      get: { ThemePreference(rawValue: themeRaw) ?? .system },
      set: { themeRaw = $0.rawValue }
    )
  }

  private var activeOrgName: String {
    guard let id = session.activeOrganizationId else { return emptyDash }
    return session.organizations.first { $0.id == id }?.name ?? id
  }

  private var appVersion: String {
    let info = Bundle.main.infoDictionary
    let short = info?["CFBundleShortVersionString"] as? String ?? emptyDash
    let build = info?["CFBundleVersion"] as? String ?? emptyDash
    return "\(short) (\(build))"
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        if let message = session.statusMessage {
          Text(message)
            .font(.footnote)
            .foregroundStyle(VerimayaTheme.danger)
        }

        VStack(alignment: .leading, spacing: 4) {
          Text("Profil ayarları")
            .font(.title2.weight(.semibold))
            .foregroundStyle(VerimayaTheme.text)
          Text("Hesap bilgilerin, organizasyon ve görünüm tercihlerin.")
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textMuted)
            .fixedSize(horizontal: false, vertical: true)
        }

        profileCard
        if session.organizations.count > 1 { organizationCard }
        themeCard
        aboutCard
        signOutCard
      }
      .padding(VerimayaUI.pagePadding)
      // Alt sekme çubuğu içeriğin üstüne binmesin.
      .padding(.bottom, 88)
    }
    .background(VerimayaTheme.bg)
    .confirmationDialog(
      "Çıkış yapmak istediğinize emin misiniz?",
      isPresented: $confirmSignOut,
      titleVisibility: .visible
    ) {
      Button("Çıkış yap", role: .destructive) { session.signOut() }
      Button("Vazgeç", role: .cancel) {}
    }
  }

  private var profileCard: some View {
    PanelCard {
      VStack(alignment: .leading, spacing: 12) {
        cardHeading("Profil", "Ad ve e-posta şimdilik salt okunur.")
        if session.isApiKeySession {
          field("Oturum", "API anahtarı oturumu")
        } else {
          field("Görünen ad", session.name.dashed)
          field("E-posta", session.email.dashed)
        }
        field("Aktif organizasyon", activeOrgName)
      }
    }
  }

  private var organizationCard: some View {
    PanelCard {
      VStack(alignment: .leading, spacing: 12) {
        cardHeading("Organizasyon", "Birden çok organizasyonda görünüyorsun.")
        ForEach(session.organizations) { org in
          Button {
            Task { await session.selectOrganization(org) }
          } label: {
            HStack {
              Text(org.name)
                .foregroundStyle(VerimayaTheme.text)
              Spacer()
              if org.id == session.activeOrganizationId {
                Image(systemName: "checkmark")
                  .foregroundStyle(VerimayaTheme.brand)
              }
            }
            .padding(.vertical, 6)
          }
          .buttonStyle(.plain)
          if org.id != session.organizations.last?.id {
            Divider().overlay(VerimayaTheme.border)
          }
        }
      }
    }
  }

  private var themeCard: some View {
    PanelCard {
      VStack(alignment: .leading, spacing: 12) {
        cardHeading("Tema", "Açık veya koyu görünüm — tercih bu cihazda saklanır.")
        Picker("Tema", selection: themeBinding) {
          ForEach(ThemePreference.allCases) { pref in
            Text(pref.label).tag(pref)
          }
        }
        .pickerStyle(.segmented)
      }
    }
  }

  private var aboutCard: some View {
    PanelCard {
      VStack(alignment: .leading, spacing: 12) {
        cardHeading("Hakkında", "Sürüm ve bağlanılan sunucu.")
        field("Sürüm", appVersion)
        field("API", AppConfig.apiBaseURL.absoluteString)
      }
    }
  }

  private var signOutCard: some View {
    PanelCard {
      Button {
        confirmSignOut = true
      } label: {
        HStack {
          Text("Çıkış yap")
            .font(.body.weight(.medium))
            .foregroundStyle(VerimayaTheme.danger)
          Spacer()
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    }
  }

  private func cardHeading(_ title: String, _ description: String) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(title)
        .font(.body.weight(.semibold))
        .foregroundStyle(VerimayaTheme.text)
      Text(description)
        .font(.subheadline)
        .foregroundStyle(VerimayaTheme.textMuted)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private func field(_ label: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(label)
        .font(.subheadline)
        .foregroundStyle(VerimayaTheme.textMuted)
      Text(value)
        .font(.body)
        .foregroundStyle(VerimayaTheme.text)
        .textSelection(.enabled)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
