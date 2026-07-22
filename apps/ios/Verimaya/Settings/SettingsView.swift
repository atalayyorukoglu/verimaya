import SwiftUI

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
    guard let id = session.activeOrganizationId else { return "—" }
    if let org = session.organizations.first(where: { $0.id == id }) {
      return org.name
    }
    return id
  }

  private var appVersion: String {
    let info = Bundle.main.infoDictionary
    let short = info?["CFBundleShortVersionString"] as? String ?? "—"
    let build = info?["CFBundleVersion"] as? String ?? "—"
    return "\(short) (\(build))"
  }

  var body: some View {
    ZStack {
      VerimayaTheme.bg.ignoresSafeArea()

      VStack(spacing: 0) {
        if let message = session.statusMessage {
          Text(message)
            .font(.footnote)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(VerimayaTheme.danger)
        }

        Form {
          Section("Hesap") {
            if session.isApiKeySession {
              LabeledContent("Oturum", value: "API anahtarı oturumu")
            } else {
              if let name = session.name, !name.isEmpty {
                LabeledContent("Ad", value: name)
              }
              LabeledContent("E-posta", value: session.email ?? "—")
            }
            LabeledContent("Aktif organizasyon", value: activeOrgName)
          }

          if session.organizations.count > 1 {
            Section("Organizasyon") {
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
                }
              }
            }
          }

          Section("Görünüm") {
            Picker("Tema", selection: themeBinding) {
              ForEach(ThemePreference.allCases) { pref in
                Text(pref.label).tag(pref)
              }
            }
          }

          Section("Hakkında") {
            LabeledContent("Sürüm", value: appVersion)
            LabeledContent("API", value: AppConfig.apiBaseURL.absoluteString)
          }

          Section {
            Button("Çıkış yap", role: .destructive) {
              confirmSignOut = true
            }
            .foregroundStyle(VerimayaTheme.danger)
          }
        }
        .scrollContentBackground(.hidden)
      }
    }
    .navigationTitle("Ayarlar")
    .confirmationDialog(
      "Çıkış yapmak istediğinize emin misiniz?",
      isPresented: $confirmSignOut,
      titleVisibility: .visible
    ) {
      Button("Çıkış yap", role: .destructive) {
        session.signOut()
      }
      Button("Vazgeç", role: .cancel) {}
    }
  }
}
