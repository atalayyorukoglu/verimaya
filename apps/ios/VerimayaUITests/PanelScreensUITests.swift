import XCTest

/// Panel ekranlarının görüntüsünü alır — web'deki mobil görünümle karşılaştırmak
/// için. Canlı API ister; değişken verilmezse atlanır.
final class PanelScreensUITests: XCTestCase {

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

  func testCaptureEveryTab() throws {
    let creds = try XCTUnwrap(credentials)
    let app = XCUIApplication()
    app.launchEnvironment["VERIMAYA_API_URL"] = creds.apiURL
    app.launch()

    let emailField = app.textFields["E-posta"]
    XCTAssertTrue(emailField.waitForExistence(timeout: 10))
    emailField.tap()
    emailField.typeText(creds.email)
    let passwordField = app.secureTextFields["Şifre"]
    passwordField.tap()
    passwordField.typeText(creds.password)
    app.buttons["Giriş yap"].tap()

    XCTAssertTrue(app.buttons["Finans"].waitForExistence(timeout: 20), "Kabuk gelmedi")

    for tab in ["Finans", "Kişiler", "Randevular", "Raporlar"] {
      app.buttons[tab].tap()
      Thread.sleep(forTimeInterval: 2.5)
      let shot = XCTAttachment(screenshot: app.screenshot())
      shot.name = "panel-\(tab)"
      shot.lifetime = .keepAlways
      add(shot)
    }

    // AI ile İşlem menüden açılıyor (web'de de alt sekmede değil).
    app.buttons["Menü"].tap()
    Thread.sleep(forTimeInterval: 1.5)
    let menuShot = XCTAttachment(screenshot: app.screenshot())
    menuShot.name = "panel-Menu"
    menuShot.lifetime = .keepAlways
    add(menuShot)

    app.buttons["AI ile İşlem"].tap()
    Thread.sleep(forTimeInterval: 3)
    let aiShot = XCTAttachment(screenshot: app.screenshot())
    aiShot.name = "panel-AI"
    aiShot.lifetime = .keepAlways
    add(aiShot)
  }
}
