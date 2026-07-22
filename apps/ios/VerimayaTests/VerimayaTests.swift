import XCTest
@testable import Verimaya

final class VerimayaTests: XCTestCase {

  func testMoneyFormatsKurusToTRY() {
    XCTAssertEqual(Money.format(minor: 123456), "1.234,56 ₺")
    XCTAssertEqual(Money.format(minor: 0), "0,00 ₺")
    XCTAssertEqual(Money.format(minor: 5, currency: "EUR"), "0,05 €")
  }

  private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
    try APIClient.decoder.decode(T.self, from: Data(json.utf8))
  }

  func testPatientDecodesSnakeCaseAndStatus() throws {
    let json = """
    {"id":"11111111-1111-1111-1111-111111111111",
     "tenant_id":"22222222-2222-2222-2222-222222222222",
     "full_name":"Ali Veli","phone":null,"email":null,
     "status":"follow_up","source":"meta","notes":null,
     "assigned_user_id":null,"contact_id":null,
     "created_at":"2026-07-22T10:00:00.000Z","updated_at":"2026-07-22T10:00:00.000Z"}
    """
    let p = try decode(Patient.self, json)
    XCTAssertEqual(p.fullName, "Ali Veli")
    XCTAssertEqual(p.status, .followUp)
    XCTAssertNil(p.phone)
  }

  func testTransactionDecodesEnumsAndMoney() throws {
    let json = """
    {"id":"1","tenant_id":"t","kind":"expense","title":"Reklam",
     "subtitle":null,"category":"pazarlama","occurred_on":"2026-07-01",
     "status":"partial","invoice_status":"not_issued","payment_method":null,
     "amount":150000,"paid_amount":50000,"currency":"TRY","amount_base":150000,
     "base_currency":"TRY","fx_rate":null,"fx_dated":null,"patient_id":null,
     "patient_display_name":null,"contact_id":null,"contact_label":null,
     "description":null,"created_at":"2026-07-01T00:00:00.000Z",
     "updated_at":"2026-07-01T00:00:00.000Z"}
    """
    let t = try decode(Transaction.self, json)
    XCTAssertEqual(t.kind, .expense)
    XCTAssertEqual(t.status, .partial)
    XCTAssertEqual(t.invoiceStatus, .notIssued)
    XCTAssertEqual(Money.format(minor: t.amount), "1.500,00 ₺")
  }

  func testCursorPageAndMarketingReport() throws {
    let cp = try decode(CursorPage<Patient>.self, #"{"items":[],"next_cursor":"abc"}"#)
    XCTAssertEqual(cp.nextCursor, "abc")

    let mkt = """
    {"period":{"from":"2026-07-01","to":"2026-07-31"},
     "spend_base":100000,"revenue_base":500000,"real_roas":5.0,
     "leads_count":40,"closed_count":8,"cost_per_lead":2500,"cost_per_closed":12500,
     "by_source":[{"source":"meta","leads":30,"closed":6,"revenue_base":400000}]}
    """
    let r = try decode(MarketingReport.self, mkt)
    XCTAssertEqual(r.realRoas, 5.0)
    XCTAssertEqual(r.bySource.first?.source, "meta")
    XCTAssertEqual(r.costPerLead, 2500)
  }
}
