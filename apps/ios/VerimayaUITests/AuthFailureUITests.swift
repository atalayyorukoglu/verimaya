import XCTest

/// Giriş ekranı takılıyor mu? Hatalı bilgiyle giriş denemesi **kısa sürede**
/// bir hata göstermeli; dönmeyen bir istek yüzünden sonsuz dönen çark
/// kullanıcıyı giriş ekranında kilitler.
///
/// Kimlik bilgisi istemez — kasten yanlış hesap kullanır.
final class AuthFailureUITests: XCTestCase {

  func testFailedSignInShowsErrorInsteadOfHanging() throws {
    let apiURL = ProcessInfo.processInfo.environment["VERIMAYA_API_URL"]
    try XCTSkipIf(apiURL == nil, "VERIMAYA_API_URL verilmedi.")

    let app = XCUIApplication()
    app.launchEnvironment["VERIMAYA_API_URL"] = apiURL!
    app.launch()

    let emailField = app.textFields["E-posta"]
    XCTAssertTrue(emailField.waitForExistence(timeout: 15), "Giriş ekranı açılmadı")
    emailField.tap()
    emailField.typeText("nonexistent-probe@example.invalid")

    let passwordField = app.secureTextFields["Şifre"]
    passwordField.tap()
    passwordField.typeText("kesinlikle-yanlis")

    app.buttons["Giriş yap"].tap()

    // Hata metni herhangi bir metin olabilir; önemli olan çarkın DURMASI ve
    // düğmenin tekrar basılabilir hâle gelmesi.
    let deadline = Date().addingTimeInterval(30)
    var recovered = false
    while Date() < deadline {
      if app.buttons["Giriş yap"].isEnabled && !app.activityIndicators.firstMatch.exists {
        recovered = true
        break
      }
      Thread.sleep(forTimeInterval: 0.5)
    }

    print("HIER-BEGIN\n\(app.debugDescription)\nHIER-END")

    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = "giris-hata"
    shot.lifetime = .keepAlways
    add(shot)

    XCTAssertTrue(recovered, "Giriş denemesi 30 sn içinde bitmedi — ekran kilitli kaldı")
  }
}
