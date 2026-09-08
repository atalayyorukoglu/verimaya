import XCTest

/*
 Ekran görüntüsü üreticisi — doğrulama testi DEĞİL, araç.

 Gerçek veriyle her sekmenin görüntüsünü alır ve `.xcresult` içine ek olarak
 yazar. Dışa aktarma:

   xcrun xcresulttool export attachments \\
     --path <sonuç>.xcresult --output-path <klasör>

 Neden `simctl io screenshot` değil: giriş yapılmış bir oturum gerekiyor ve
 imzasız simülatör kurulumunda Keychain kaydı uygulama yeniden kurulunca
 kalmıyor. Test içinden giriş yapıp görüntü almak tek deterministik yol.

 Kimlik değişkenleri yoksa ATLANIR (bkz. LiveAPIUITests).
*/
final class ScreenshotUITests: XCTestCase {

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testCaptureAllTabs() throws {
        let env = ProcessInfo.processInfo.environment
        func value(_ name: String) -> String? {
            [env["TEST_RUNNER_\(name)"], env[name]].compactMap { $0 }.first { !$0.isEmpty }
        }
        guard let apiURL = value("VERIMAYA_API_URL"),
              let email = value("VERIMAYA_UITEST_EMAIL"),
              let password = value("VERIMAYA_UITEST_PASSWORD") else {
            throw XCTSkip("TEST_RUNNER_VERIMAYA_* değişkenleri yok; ekran görüntüsü alınmadı.")
        }

        let app = XCUIApplication()
        app.launchEnvironment["VERIMAYA_API_URL"] = apiURL
        app.launch()

        // Giriş ekranı da bir teslim: sunucu adresi altta görünüyor.
        let emailField = app.textFields["login.email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 20))
        capture(app, name: "00-giris")

        emailField.tap()
        emailField.typeText(email)
        let passwordField = app.secureTextFields["login.password"]
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons["login.submit"].tap()

        XCTAssertTrue(app.buttons["tab.finance"].waitForExistence(timeout: 30), "Giriş başarısız")
        settle()
        capture(app, name: "01-finans")

        for (identifier, name) in [
            ("tab.contacts", "02-kisiler"),
            ("tab.appointments", "03-randevular"),
            ("tab.reports", "04-raporlar")
        ] {
            app.buttons[identifier].tap()
            settle()
            capture(app, name: name)
        }

        // Finans → "AI ile işlem"
        app.buttons["tab.finance"].tap()
        settle()
        let aiLink = app.buttons.containing(
            NSPredicate(format: "label CONTAINS[c] %@", "AI ile işlem")
        ).firstMatch
        if aiLink.waitForExistence(timeout: 10) {
            aiLink.tap()
            settle()
            capture(app, name: "05-ai-ile-islem")
            // Geri: "İşlemler" düğmesi
            let back = app.buttons.containing(
                NSPredicate(format: "label CONTAINS[c] %@", "İşlemler")
            ).firstMatch
            if back.exists { back.tap() }
            settle()
        }

        // Menü çekmecesi → hesap menüsü → Profil ayarları
        app.buttons["tab.menu"].tap()
        settle()
        capture(app, name: "06-menu-cekmecesi")

        let accountToggle = app.buttons["Hesap menüsü"]
        if accountToggle.waitForExistence(timeout: 5) {
            accountToggle.tap()
            settle()
            capture(app, name: "07-hesap-menusu")

            let profile = app.buttons.containing(
                NSPredicate(format: "label CONTAINS[c] %@", "Profil ayarları")
            ).firstMatch
            if profile.waitForExistence(timeout: 5) {
                profile.tap()
                settle()
                capture(app, name: "08-profil-ayarlari")
            }
        }
    }

    /// Ekranın yerleşmesi ve isteklerin dönmesi için bekle.
    private func settle() {
        Thread.sleep(forTimeInterval: 2.5)
    }

    private func capture(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
