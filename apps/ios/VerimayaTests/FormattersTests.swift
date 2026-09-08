import XCTest
@testable import Verimaya

/*
 Biçimlendiricilerin web ile birebir aynı çıktı verdiğini doğrular.

 Beklenen değerler `apps/web/src/lib/format.ts` çalıştırılarak alındı
 (Node, tr-TR yereli):
   formatMoney(123456,'TRY')        → "₺1.234,56"
   formatMoney(290000,'GBP')        → "£2.900,00"
   formatMoney(-45050,'EUR')        → "-€450,50"
   formatDate('2026-09-04…')        → "4 Eyl 2026"
   formatDateTime(…16:30 TRT)       → "4 Eyl 16:30"
   formatTime(…)                    → "16:30"
   formatPercent(0.53)              → "%53,0"
*/
final class FormattersTests: XCTestCase {

    /// 4 Eylül 2026, 16:30 Europe/Istanbul.
    private var reference: Date {
        var comps = DateComponents()
        comps.year = 2026
        comps.month = 9
        comps.day = 4
        comps.hour = 16
        comps.minute = 30
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = VMFormat.timeZone
        return cal.date(from: comps)!
    }

    // MARK: Para — simge BAŞTA (arşiv dersi #7)

    func testMoneyTRY() {
        XCTAssertEqual(VMFormat.money(123_456), "₺1.234,56")
    }

    func testMoneyGBP() {
        XCTAssertEqual(VMFormat.money(290_000, currency: "GBP"), "£2.900,00")
    }

    func testMoneyNegativeEUR() {
        XCTAssertEqual(VMFormat.money(-45_050, currency: "EUR"), "-€450,50")
    }

    func testMoneyUSD() {
        XCTAssertEqual(VMFormat.money(123_456, currency: "USD"), "$1.234,56")
    }

    func testMoneyZero() {
        XCTAssertEqual(VMFormat.money(0), "₺0,00")
    }

    // MARK: Tarih / saat

    func testDate() {
        XCTAssertEqual(VMFormat.day(reference), "4 Eyl 2026")
    }

    func testDateTime() {
        XCTAssertEqual(VMFormat.dateTime(reference), "4 Eyl 16:30")
    }

    func testTime() {
        XCTAssertEqual(VMFormat.time(reference), "16:30")
    }

    func testMonthYear() {
        XCTAssertEqual(VMFormat.monthYear(reference), "Eylül 2026")
    }

    func testShortDay() {
        XCTAssertEqual(VMFormat.shortDay(reference), "4 Eyl")
    }

    // MARK: Oran

    func testPercent() {
        XCTAssertEqual(VMFormat.percent(0.53), "%53,0")
    }

    func testPercentZeroDigits() {
        XCTAssertEqual(VMFormat.percent(0.667, digits: 0), "%67")
    }

    // MARK: Baş harf (initialsOf)

    func testInitialsTwoWords() {
        XCTAssertEqual(VMFormat.initials("Sandra Whitfield"), "SW")
    }

    func testInitialsTurkishLowercaseI() {
        // `toLocaleUpperCase('tr-TR')`: "i" → "İ".
        XCTAssertEqual(VMFormat.initials("ilker deniz"), "İD")
    }

    func testInitialsEmpty() {
        XCTAssertEqual(VMFormat.initials(nil), "?")
        XCTAssertEqual(VMFormat.initials("   "), "?")
    }

    // MARK: parseMoneyInput

    func testParseMoneyTurkishFormat() {
        XCTAssertEqual(parseMoneyInput("1.000,50"), 100_050)
    }

    func testParseMoneyPlainDecimal() {
        XCTAssertEqual(parseMoneyInput("1000.5"), 100_050)
    }

    func testParseMoneyThousandsOnly() {
        XCTAssertEqual(parseMoneyInput("1.000"), 100_000)
    }

    func testParseMoneyInvalid() {
        XCTAssertNil(parseMoneyInput(""))
        XCTAssertNil(parseMoneyInput("abc"))
    }

    // MARK: deriveTransactionLabel

    func testDerivedLabelPrefersTitle() {
        let tx = makeTransaction(title: "2. vizit", category: "Tedavi", subtitle: "Saç")
        XCTAssertEqual(tx.derivedLabel, "2. vizit")
    }

    func testDerivedLabelCategoryAndSubtitle() {
        let tx = makeTransaction(title: nil, category: "Tedavi", subtitle: "Saç")
        XCTAssertEqual(tx.derivedLabel, "Tedavi › Saç")
    }

    func testDerivedLabelFallsBackToContact() {
        let tx = makeTransaction(title: nil, category: nil, subtitle: nil, contact: "Elena Petrova")
        XCTAssertEqual(tx.derivedLabel, "Elena Petrova")
    }

    func testDerivedLabelFallsBackToDash() {
        let tx = makeTransaction(title: nil, category: nil, subtitle: nil)
        XCTAssertEqual(tx.derivedLabel, "—")
    }

    private func makeTransaction(
        title: String?,
        category: String?,
        subtitle: String?,
        contact: String? = nil
    ) -> Transaction {
        Transaction(
            id: "t-test", kind: .income, status: .paid, amount: 1000, currency: "TRY",
            amountBase: 1000, occurredOn: reference, title: title, category: category,
            subtitle: subtitle, contactDisplayName: contact, description: nil
        )
    }
}

/// Dönem mantığı — `resolvePeriodRange` ve ok tuşlarının davranışı.
final class PeriodTests: XCTestCase {

    func testAllTimeHasNoRange() {
        XCTAssertNil(Period(key: .tum).range)
    }

    func testAllTimeContainsEverything() {
        let period = Period(key: .tum)
        XCTAssertTrue(period.contains(Date(timeIntervalSince1970: 0)))
    }

    func testThisMonthContainsToday() {
        XCTAssertTrue(Period(key: .buAy).contains(Date()))
    }

    func testLastMonthExcludesToday() {
        XCTAssertFalse(Period(key: .gecenAy).contains(Date()))
    }

    /// Ok tuşu hangi dönemde olursa olsun bir AY aralığı üretir.
    func testStepMonthProducesWholeMonth() {
        var period = Period(key: .tum)
        period.stepMonth(-1)
        guard let range = period.range else { return XCTFail("aralık boş") }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = VMFormat.timeZone
        XCTAssertEqual(cal.component(.day, from: range.from), 1)
        XCTAssertTrue(cal.isDate(range.from, equalTo: range.to, toGranularity: .month))
        // Tam ay olduğu için etiket "Ay Yıl" biçiminde olmalı, iki uçlu değil.
        XCTAssertFalse(period.headerLabel.contains("–"))
    }

    func testHeaderLabelForAllTime() {
        XCTAssertEqual(Period(key: .tum).headerLabel, "Tüm zamanlar")
    }
}
