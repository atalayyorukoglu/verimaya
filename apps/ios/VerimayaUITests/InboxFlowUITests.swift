import XCTest

/// AI işlem sekmesinin uçtan uca duman testi.
///
/// Gerçek bir API ister — bu yüzden ortam değişkeni verilmediğinde atlanır;
/// CI'da (Node) koşmaz, geliştirici makinesinde elle koşulur:
///
/// ```
/// VERIMAYA_API_URL=http://localhost:3001 \
/// VERIMAYA_UITEST_EMAIL=... VERIMAYA_UITEST_PASSWORD=... \
/// xcodebuild test -scheme Verimaya -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
/// ```
final class InboxFlowUITests: XCTestCase {

  private var credentials: (email: String, password: String, apiURL: String)? {
    let env = ProcessInfo.processInfo.environment
    guard let email = env["VERIMAYA_UITEST_EMAIL"],
          let password = env["VERIMAYA_UITEST_PASSWORD"],
          let apiURL = env["VERIMAYA_API_URL"]
    else { return nil }
    return (email, password, apiURL)
  }

  override func setUpWithError() throws {
    continueAfterFailure = false
    try XCTSkipIf(credentials == nil, "VERIMAYA_UITEST_* verilmedi — canlı API testi atlandı.")
  }

  func testSignInThenOpenInboxTab() throws {
    let creds = try XCTUnwrap(credentials)
    let app = XCUIApplication()
    app.launchEnvironment["VERIMAYA_API_URL"] = creds.apiURL
    app.launch()

    let emailField = app.textFields["E-posta"]
    XCTAssertTrue(emailField.waitForExistence(timeout: 10), "Giriş ekranı açılmadı")
    emailField.tap()
    emailField.typeText(creds.email)

    let passwordField = app.secureTextFields["Şifre"]
    passwordField.tap()
    passwordField.typeText(creds.password)

    app.buttons["Giriş yap"].tap()

    // iOS 26'da SwiftUI TabView her zaman `tabBars` altına düşmüyor; ikisini de dene.
    let tabBarButton = app.tabBars.buttons["AI işlem"]
    let anyButton = app.buttons["AI işlem"]
    XCTAssertTrue(
      tabBarButton.waitForExistence(timeout: 20) || anyButton.waitForExistence(timeout: 10),
      "Giriş sonrası sekmeler gelmedi"
    )
    (tabBarButton.exists ? tabBarButton : anyButton).tap()

    XCTAssertTrue(
      app.navigationBars["AI işlem"].waitForExistence(timeout: 10),
      "AI işlem ekranı açılmadı"
    )

    // Ekran ya mesajları ya da boş durumu göstermeli; ikisi de yoksa istek patlamıştır.
    let emptyState = app.staticTexts["Bekleyen mesaj yok"]
    let anyRow = app.buttons["Analiz et"].firstMatch
    let loaded = emptyState.waitForExistence(timeout: 15) || anyRow.waitForExistence(timeout: 5)
    XCTAssertTrue(loaded, "Gelen kutusu ne liste ne boş durum gösterdi")

    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = "ai-islem-sekmesi"
    shot.lifetime = .keepAlways
    add(shot)
  }
}
