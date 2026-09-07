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

    // AI ile İşlem alt sekmede değil (web'de de değil) — Menü'den açılır.
    XCTAssertTrue(app.buttons["Menü"].waitForExistence(timeout: 20), "Kabuk gelmedi")
    app.buttons["Menü"].tap()

    let aiItem = app.buttons["AI ile İşlem"]
    XCTAssertTrue(aiItem.waitForExistence(timeout: 10), "Menüde AI ile İşlem yok")
    aiItem.tap()

    XCTAssertTrue(
      app.staticTexts["AI ile İşlem"].waitForExistence(timeout: 10),
      "AI ile İşlem ekranı açılmadı"
    )

    // Ekran ya mesajları ya da boş durumu göstermeli; ikisi de yoksa istek patlamıştır.
    let emptyState = app.staticTexts["Bekleyen mesaj yok."]
    let anyRow = app.buttons["Analiz Et"].firstMatch
    let loaded = emptyState.waitForExistence(timeout: 15) || anyRow.waitForExistence(timeout: 5)
    XCTAssertTrue(loaded, "Gelen kutusu ne liste ne boş durum gösterdi")

    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = "ai-islem-sekmesi"
    shot.lifetime = .keepAlways
    add(shot)
  }

  /// Regresyon: uygulama `/v1/patients` çağırıyordu, o uç kalkmıştı ve ekran
  /// kırmızı bir "Cannot GET /v1/patients" şeridiyle açılıyordu.
  func testContactsTabLoadsWithoutApiError() throws {
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

    XCTAssertTrue(app.buttons["Kişiler"].waitForExistence(timeout: 20), "Kabuk gelmedi")
    app.buttons["Kişiler"].tap()
    XCTAssertTrue(
      app.staticTexts["Kişiler"].waitForExistence(timeout: 10),
      "Kişiler ekranı açılmadı"
    )

    // Hata şeridi API'den gelen ham mesajı gösteriyor; "Cannot GET" veya
    // "/v1/" içeren bir metin görünüyorsa uç yanlış demektir.
    let errorBanner = app.staticTexts.containing(
      NSPredicate(format: "label CONTAINS[c] 'Cannot GET' OR label CONTAINS[c] '/v1/'")
    ).firstMatch
    XCTAssertFalse(errorBanner.waitForExistence(timeout: 5), "Kişiler ekranında API hatası var")

    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = "kisiler-sekmesi"
    shot.lifetime = .keepAlways
    add(shot)
  }
}
