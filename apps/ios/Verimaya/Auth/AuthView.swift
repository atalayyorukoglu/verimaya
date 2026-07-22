import SwiftUI

struct AuthView: View {
  @EnvironmentObject private var session: SessionStore

  private enum Method: String, CaseIterable, Identifiable {
    case email = "E-posta", apiKey = "API anahtarı"
    var id: String { rawValue }
  }

  @State private var method: Method = .email
  @State private var email = ""
  @State private var password = ""
  @State private var apiKey = ""

  var body: some View {
    ZStack {
      VerimayaTheme.bg.ignoresSafeArea()
      VStack(spacing: 20) {
        Spacer()
        VStack(spacing: 6) {
          Text("Verimaya")
            .font(.system(size: 34, weight: .semibold))
            .foregroundStyle(VerimayaTheme.text)
          Text("Sağlık turizmi operasyon paneli")
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textMuted)
        }

        Picker("Yöntem", selection: $method) {
          ForEach(Method.allCases) { Text($0.rawValue).tag($0) }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal)

        Group {
          if method == .email { emailForm } else { apiKeyForm }
        }
        .padding(.horizontal)

        if let status = session.statusMessage {
          Text(status)
            .font(.caption)
            .foregroundStyle(VerimayaTheme.danger)
            .multilineTextAlignment(.center)
            .padding(.horizontal)
        }
        Spacer()
      }
    }
    .tint(VerimayaTheme.brand)
    .disabled(session.isBusy)
    .overlay { if session.isBusy { ProgressView() } }
  }

  private var emailForm: some View {
    VStack(spacing: 12) {
      TextField("E-posta", text: $email)
        .textContentType(.emailAddress)
        .keyboardType(.emailAddress)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .padding(12)
        .background(VerimayaTheme.surface, in: RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
      SecureField("Şifre", text: $password)
        .textContentType(.password)
        .padding(12)
        .background(VerimayaTheme.surface, in: RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
      Button {
        Task { await session.signInEmail(email: email, password: password) }
      } label: {
        Text("Giriş yap").frame(maxWidth: .infinity)
      }
      .buttonStyle(.borderedProminent)
      .disabled(email.isEmpty || password.isEmpty)
    }
  }

  private var apiKeyForm: some View {
    VStack(spacing: 12) {
      SecureField("vk_ ile başlayan API anahtarı", text: $apiKey)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .padding(12)
        .background(VerimayaTheme.surface, in: RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
      Button {
        Task { await session.signInApiKey(apiKey) }
      } label: {
        Text("Anahtarla bağlan").frame(maxWidth: .infinity)
      }
      .buttonStyle(.borderedProminent)
      .disabled(apiKey.isEmpty)
      Text("Makine erişimi: tek tenant'a sabit, kullanıcı kimliği yok. Web panelinden üretilir.")
        .font(.caption2)
        .foregroundStyle(VerimayaTheme.textFaint)
        .multilineTextAlignment(.center)
    }
  }
}
