import XCTest
@testable import Verimaya

final class VerimayaTests: XCTestCase {

  /// Web ile aynı biçim: simge **başta** (`Intl.NumberFormat` `style: 'currency'`).
  /// Uygulama bir dönem simgeyi sona koyuyordu, panelle uyuşmuyordu.
  func testMoneyMatchesWebCurrencyFormat() {
    XCTAssertEqual(Money.format(minor: 123456), "₺1.234,56")
    XCTAssertEqual(Money.format(minor: 0), "₺0,00")
    XCTAssertEqual(Money.format(minor: 5, currency: "EUR"), "€0,05")
  }

  /// `formatDate` karşılığı — "4 Eyl 2026". Takvim tarihi saat dilimine
  /// çevrilmez, bu yüzden makineden bağımsız.
  func testDayMatchesWebFormat() {
    XCTAssertEqual(DateFmt.day("2026-09-04"), "4 Eyl 2026")
  }

  /// `formatTime` karşılığı — 24 saatlik "HH:mm". Değer makinenin saat dilimine
  /// göre değiştiği için biçim doğrulanır, sabit saat değil.
  func testTimeUsesTwentyFourHourFormat() {
    let text = DateFmt.timeOnly("2026-09-04T15:00:00.000Z")
    XCTAssertEqual(text.count, 5)
    XCTAssertEqual(text.filter { $0 == ":" }.count, 1)
    XCTAssertTrue(text.replacingOccurrences(of: ":", with: "").allSatisfy(\.isNumber))
  }

  private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
    try APIClient.decoder.decode(T.self, from: Data(json.utf8))
  }

  /// Regresyon: sunucuda "hasta" varlığı yok, herkes bir **kişi**.
  /// Uygulama bir dönem `/v1/patients` ve `full_name` bekliyordu; uç kalkınca
  /// Kişiler ekranı "Cannot GET /v1/patients" veriyordu.
  func testContactDecodesSnakeCaseAndOptionalStatus() throws {
    let json = """
    {"id":"11111111-1111-1111-1111-111111111111",
     "tenant_id":"22222222-2222-2222-2222-222222222222",
     "contact_type_id":"33333333-3333-3333-3333-333333333333",
     "contact_type_name":"Hasta","title_id":null,"title_name":null,
     "first_name":"Ali","last_name":"Veli","display_name":"Ali Veli",
     "phone":null,"email":null,"notes":null,"organization_id":null,
     "status":"follow_up","assigned_user_id":null,"source":"meta",
     "medium":null,"campaign":null,"referred_by_contact_id":null,
     "is_internal":false,"usage_count":3,
     "created_at":"2026-07-22T10:00:00.000Z","updated_at":"2026-07-22T10:00:00.000Z"}
    """
    let c = try decode(Contact.self, json)
    XCTAssertEqual(c.displayName, "Ali Veli")
    XCTAssertEqual(c.firstName, "Ali")
    XCTAssertEqual(c.contactTypeName, "Hasta")
    XCTAssertEqual(c.status, .followUp)
    XCTAssertNil(c.phone)
  }

  /// Durum yalnız "Hasta" tipinde anlamlı; diğer kişilerde null geliyor.
  func testContactAcceptsNullStatus() throws {
    let json = """
    {"id":"1","tenant_id":"t","contact_type_id":"ct","contact_type_name":"Klinik",
     "title_id":null,"title_name":null,"first_name":"Ada","last_name":null,
     "display_name":"Ada","phone":null,"email":null,"notes":null,
     "organization_id":null,"status":null,"assigned_user_id":null,"source":null,
     "medium":null,"campaign":null,"referred_by_contact_id":null,
     "is_internal":false,"usage_count":0,
     "created_at":"2026-07-22T10:00:00.000Z","updated_at":"2026-07-22T10:00:00.000Z"}
    """
    let c = try decode(Contact.self, json)
    XCTAssertNil(c.status)
    XCTAssertNil(c.lastName)
  }

  /// Oluşturma gövdesi `display_name` göndermemeli — sunucu türetiyor, fazladan
  /// alan sözleşmeyi bozar.
  func testContactCreateEncodesSnakeCaseWithoutDisplayName() throws {
    let body = ContactCreate(
      contactTypeId: "ct", titleId: nil, firstName: "Ali", lastName: "Veli",
      phone: nil, email: nil, notes: nil, status: .scheduled, source: nil
    )
    let json = try XCTUnwrap(String(data: APIClient.encoder.encode(body), encoding: .utf8))
    XCTAssertTrue(json.contains("\"contact_type_id\""))
    XCTAssertTrue(json.contains("\"first_name\""))
    XCTAssertFalse(json.contains("display_name"))
  }

  func testTransactionDecodesEnumsAndMoney() throws {
    let json = """
    {"id":"1","tenant_id":"t","kind":"expense","title":"Reklam",
     "subtitle":null,"category":"pazarlama","occurred_on":"2026-07-01",
     "status":"partial","invoice_status":"not_issued","payment_method":null,
     "amount":150000,"paid_amount":50000,"currency":"TRY","amount_base":150000,
     "base_currency":"TRY","fx_rate":null,"fx_dated":null,
     "contact_id":null,"contact_display_name":null,"contact_label":null,
     "case_contact_id":null,"responsible_contact_id":null,
     "description":null,"created_at":"2026-07-01T00:00:00.000Z",
     "updated_at":"2026-07-01T00:00:00.000Z"}
    """
    let t = try decode(Transaction.self, json)
    XCTAssertEqual(t.kind, .expense)
    XCTAssertEqual(t.status, .partial)
    XCTAssertEqual(t.invoiceStatus, .notIssued)
    XCTAssertEqual(Money.format(minor: t.amount), "₺1.500,00")
  }

  func testCursorPageAndMarketingReport() throws {
    let cp = try decode(CursorPage<Contact>.self, #"{"items":[],"next_cursor":"abc"}"#)
    XCTAssertEqual(cp.nextCursor, "abc")

    let mkt = """
    {"period":{"from":"2026-07-01","to":"2026-07-31","effective_from":"2026-07-01","effective_to":"2026-07-31"},
     "spend_base":100000,"revenue_base":500000,"real_roas":5.0,
     "leads_count":40,"treated_count":8,"cost_per_lead":2500,"cost_per_treated":12500,
     "spend_fx_missing":false,"attribution_missing":false,
     "by_source":[{"source":"meta","leads":30,"treated":6,"revenue_base":400000}]}
    """
    let r = try decode(MarketingReport.self, mkt)
    XCTAssertEqual(r.realRoas, 5.0)
    XCTAssertEqual(r.treatedCount, 8)
    XCTAssertEqual(r.bySource.first?.source, "meta")
    XCTAssertEqual(r.bySource.first?.treated, 6)
    XCTAssertEqual(r.costPerLead, 2500)
    XCTAssertEqual(r.costPerTreated, 12500)
    XCTAssertEqual(r.period.effectiveFrom, "2026-07-01")
  }

  func testMarketingReportDecodesNullSpendBase() throws {
    let mkt = """
    {"period":{"from":null,"to":null,"effective_from":null,"effective_to":null},
     "spend_base":null,"revenue_base":150000,"real_roas":null,
     "leads_count":2,"treated_count":1,"cost_per_lead":null,"cost_per_treated":null,
     "spend_fx_missing":true,"attribution_missing":false,
     "by_source":[{"source":"Bilinmeyen","leads":2,"treated":1,"revenue_base":150000}]}
    """
    let r = try decode(MarketingReport.self, mkt)
    XCTAssertNil(r.spendBase)
    XCTAssertTrue(r.spendFxMissing)
    XCTAssertFalse(r.attributionMissing)
    XCTAssertNil(r.realRoas)
    XCTAssertNil(r.period.effectiveFrom)
  }
}
