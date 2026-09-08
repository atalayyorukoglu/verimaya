import XCTest

/*
 CANLI API'ye karşı koşan regresyon testleri.

 Üçü de GERÇEKTEN YAŞANMIŞ hataları koruyor:
   1. Giriş sonrası ekranda "Cannot GET" / "/v1/" içeren ham sunucu hatası
      görünmesi (yanlış yol → 404 gövdesi ekrana basılıyordu).
   2. Sayacın `total_count` yerine yüklü satır sayısını göstermesi
      (panel "51 kişi" derken uygulama "1 kişi" diyordu).
   3. Ulaşılamayan sunucuda giriş ekranının donması (varsayılan 60 sn zaman
      aşımı; sunucu dağıtımdayken kullanıcı 1 dakika bekledi).

 Değişkenler `TEST_RUNNER_` ÖNEKİYLE geçirilir — XCUITest koşucusu ayrı bir
 süreçtir ve öneksiz değişken ona ulaşmaz:
   TEST_RUNNER_VERIMAYA_API_URL
   TEST_RUNNER_VERIMAYA_UITEST_EMAIL
   TEST_RUNNER_VERIMAYA_UITEST_PASSWORD

 Değişken yoksa testler ATLANIR: CI Node tarafında koşuyor ve bu testleri
 görmüyor; yerelde canlı API olmadan koşturmak da kırmızı vermemeli.
*/
final class LiveAPIUITests: XCTestCase {

    private struct Credentials {
        let apiURL: String
        let email: String
        let password: String
    }

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    /*
     Ortam değişkenlerini okur; eksikse `nil` (test atlanır).

     İki ad da denenir: Xcode şema üzerinden geçirildiğinde `TEST_RUNNER_` öneki
     koşucuya ulaşırken SOYULUR; `xcodebuild`'e kabuktan verildiğinde önekli
     hâliyle gelir. İkisini de okumak, testin nasıl başlatıldığından bağımsız
     çalışmasını sağlar.
    */
    private func credentials() -> Credentials? {
        let env = ProcessInfo.processInfo.environment
        func value(_ name: String) -> String? {
            let candidates = [env["TEST_RUNNER_\(name)"], env[name]]
            return candidates.compactMap { $0 }.first { !$0.isEmpty }
        }
        guard let apiURL = value("VERIMAYA_API_URL"),
              let email = value("VERIMAYA_UITEST_EMAIL"),
              let password = value("VERIMAYA_UITEST_PASSWORD") else {
            return nil
        }
        return Credentials(apiURL: apiURL, email: email, password: password)
    }

    private func launchApp(apiURL: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["VERIMAYA_API_URL"] = apiURL
        app.launch()
        return app
    }

    private func signIn(_ app: XCUIApplication, _ credentials: Credentials) {
        let email = app.textFields["login.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 20), "Giriş ekranı gelmedi")
        email.tap()
        email.typeText(credentials.email)

        let password = app.secureTextFields["login.password"]
        XCTAssertTrue(password.exists, "Şifre alanı yok")
        password.tap()
        password.typeText(credentials.password)

        app.buttons["login.submit"].tap()
    }

    // MARK: 1 — Giriş çalışıyor, ekranda ham sunucu hatası yok

    func testSignInReachesTabsWithoutRawServerError() throws {
        guard let credentials = credentials() else {
            throw XCTSkip("TEST_RUNNER_VERIMAYA_* değişkenleri yok; canlı API testi atlandı.")
        }

        let app = launchApp(apiURL: credentials.apiURL)
        signIn(app, credentials)

        // Sekme çubuğu geldiyse oturum açıldı ve panel çizildi.
        let financeTab = app.buttons["tab.finance"]
        XCTAssertTrue(financeTab.waitForExistence(timeout: 30), "Giriş sonrası sekmeler gelmedi")
        XCTAssertTrue(app.buttons["tab.contacts"].exists)
        XCTAssertTrue(app.buttons["tab.appointments"].exists)
        XCTAssertTrue(app.buttons["tab.reports"].exists)

        // Ham sunucu hatası ekranda OLMAMALI. "Cannot GET /v1/..." tipik 404
        // gövdesiydi ve doğrudan hata şeridine basılıyordu.
        assertNoRawServerError(app)

        // Sekmeleri gez: her biri veri çekiyor, hiçbirinde ham hata çıkmamalı.
        for identifier in ["tab.contacts", "tab.appointments", "tab.reports", "tab.finance"] {
            app.buttons[identifier].tap()
            // Ekranın yüklenmesine fırsat ver.
            _ = app.staticTexts.firstMatch.waitForExistence(timeout: 10)
            assertNoRawServerError(app)
        }
    }

    /// Ekranda "Cannot GET" ya da ham "/v1/" yolu içeren bir metin var mı?
    private func assertNoRawServerError(_ app: XCUIApplication) {
        let banner = app.descendants(matching: .any)
            .matching(identifier: "error.banner")
            .firstMatch
        if banner.exists {
            XCTFail("Hata şeridi görünüyor: \(banner.label)")
        }
        let offending = app.staticTexts.allElementsBoundByIndex
            .map(\.label)
            .filter { $0.contains("Cannot GET") || $0.contains("/v1/") }
        XCTAssertTrue(
            offending.isEmpty,
            "Ekranda ham sunucu hatası var: \(offending.joined(separator: " | "))"
        )
    }

    // MARK: 2 — Sayaç `total_count`'tan geliyor

    func testContactsCountComesFromTotalCountNotLoadedRows() throws {
        guard let credentials = credentials() else {
            throw XCTSkip("TEST_RUNNER_VERIMAYA_* değişkenleri yok; canlı API testi atlandı.")
        }

        let app = launchApp(apiURL: credentials.apiURL)
        signIn(app, credentials)

        XCTAssertTrue(app.buttons["tab.contacts"].waitForExistence(timeout: 30))
        app.buttons["tab.contacts"].tap()

        let countLabel = app.staticTexts["contacts.count"]
        XCTAssertTrue(countLabel.waitForExistence(timeout: 20), "Kişi sayacı gelmedi")

        // Sayaç "{n} kişi" / "{n} kişi (filtreli)" biçiminde olmalı — açıklama
        // metni değil. Açıklama görünüyorsa `total_count` hiç okunmamış demektir.
        let label = countLabel.label
        XCTAssertTrue(
            label.contains("kişi"),
            "Sayaç beklenen biçimde değil: \(label)"
        )
        XCTAssertFalse(
            label.contains("cariler"),
            "Sayaç yerine açıklama metni görünüyor — total_count okunmamış: \(label)"
        )

        // Sunucudaki gerçek `total_count` ile karşılaştır.
        let expected = try fetchContactsTotalCount(credentials: credentials)
        XCTAssertTrue(
            label.contains("\(expected)"),
            "Sayaç sunucudaki total_count (\(expected)) ile uyuşmuyor: \(label)"
        )
    }

    /*
     Testin kendi HTTP çağrısı: sunucudaki gerçek `total_count`.

     Uygulamanın giriş akışının AYNISI izlenir — sign-in tek başına yetmez:
     aktif organizasyon seçilmeden her liste ucu
     `active_organization_required` döndürür (canlıya karşı doğrulandı).
    */
    private func fetchContactsTotalCount(credentials: Credentials) throws -> Int {
        let token = try signInForToken(credentials: credentials)
        try activateFirstOrganization(credentials: credentials, token: token)

        var request = URLRequest(url: URL(string: "\(credentials.apiURL)/v1/contacts?limit=1")!)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, http) = try syncRequest(request)
        XCTAssertEqual(http.statusCode, 200,
                       "Kişi listesi alınamadı: \(String(data: data, encoding: .utf8) ?? "")")

        struct Page: Decodable { let total_count: Int? }
        let page = try JSONDecoder().decode(Page.self, from: data)
        return try XCTUnwrap(page.total_count, "Sunucu total_count döndürmedi")
    }

    /// better-auth: organizasyon listesi → ilkini aktif yap.
    private func activateFirstOrganization(credentials: Credentials, token: String) throws {
        var listRequest = URLRequest(
            url: URL(string: "\(credentials.apiURL)/v1/auth/organization/list")!
        )
        listRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        listRequest.setValue("verimaya://ios", forHTTPHeaderField: "Origin")
        let (listData, _) = try syncRequest(listRequest)

        struct Org: Decodable { let id: String }
        let orgs = try JSONDecoder().decode([Org].self, from: listData)
        let organizationId = try XCTUnwrap(orgs.first?.id, "Kullanıcının organizasyonu yok")

        var activateRequest = URLRequest(
            url: URL(string: "\(credentials.apiURL)/v1/auth/organization/set-active")!
        )
        activateRequest.httpMethod = "POST"
        activateRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        activateRequest.setValue("verimaya://ios", forHTTPHeaderField: "Origin")
        activateRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        activateRequest.httpBody = try JSONSerialization.data(
            withJSONObject: ["organizationId": organizationId]
        )
        _ = try syncRequest(activateRequest)
    }

    private func signInForToken(credentials: Credentials) throws -> String {
        var request = URLRequest(url: URL(string: "\(credentials.apiURL)/v1/auth/sign-in/email")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // Origin şart — better-auth durum değiştiren uçlarda denetliyor.
        request.setValue("verimaya://ios", forHTTPHeaderField: "Origin")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": credentials.email,
            "password": credentials.password
        ])
        let (_, response) = try syncRequest(request)
        // Jeton GÖVDEDE değil, `set-auth-token` BAŞLIĞINDA.
        return try XCTUnwrap(
            response.value(forHTTPHeaderField: "set-auth-token"),
            "set-auth-token başlığı gelmedi"
        )
    }

    private func syncRequest(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        var result: Result<(Data, HTTPURLResponse), Error>?
        let semaphore = DispatchSemaphore(value: 0)
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                result = .failure(error)
            } else if let data, let http = response as? HTTPURLResponse {
                result = .success((data, http))
            }
            semaphore.signal()
        }.resume()
        _ = semaphore.wait(timeout: .now() + 30)
        return try XCTUnwrap(result).get()
    }

    // MARK: 3 — Ulaşılamayan sunucu ekranı kilitlemiyor

    /// Kimlik bilgisi İSTEMEZ: kasten ulaşılamayan bir adrese, kasten yanlış
    /// hesapla giriş denenir. Beklenen: 30 sn içinde düğme yeniden basılabilir
    /// ve anlaşılır bir hata görünür — sonsuza kadar dönen çark DEĞİL.
    func testUnreachableServerReleasesScreenWithin30Seconds() throws {
        // Yönlendirilemeyen adres (TEST-NET-1, RFC 5737): bağlantı kurulamaz.
        let app = launchApp(apiURL: "http://192.0.2.1:9")

        let email = app.textFields["login.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 20), "Giriş ekranı gelmedi")
        email.tap()
        email.typeText("yok@verimaya.local")

        let password = app.secureTextFields["login.password"]
        password.tap()
        password.typeText("kasten-yanlis")

        let submit = app.buttons["login.submit"]
        let started = Date()
        submit.tap()

        // Hata şeridi 30 sn içinde çıkmalı (istek zaman aşımı 20 sn).
        // Kimlik SwiftUI'da `otherElements` olmayabilir — her tür torunda aranır.
        let error = app.descendants(matching: .any)
            .matching(identifier: "login.error")
            .firstMatch
        let appeared = error.waitForExistence(timeout: 30)
        let elapsed = Date().timeIntervalSince(started)

        XCTAssertTrue(appeared, "30 sn içinde hata gösterilmedi — ekran kilitli kaldı")
        XCTAssertLessThan(elapsed, 30, "Ekran \(Int(elapsed)) sn boyunca donuk kaldı")

        // Ekran serbest: düğme yeniden basılabilir olmalı.
        XCTAssertTrue(submit.isEnabled, "Giriş düğmesi hâlâ devre dışı")
        // Ve panel AÇILMAMIŞ olmalı.
        XCTAssertFalse(app.buttons["tab.finance"].exists, "Başarısız girişte panel açıldı")
    }
}
