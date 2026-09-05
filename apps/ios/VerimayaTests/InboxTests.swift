import XCTest
@testable import Verimaya

/// AI işlem ekranı — sözleşme çözümlemesi ve onay doğrulaması.
/// Doğrulama sunucudaki `approveDraftItemSchema` kurallarını yansıtır; buradaki
/// testler bozulursa istek 422 ile geri döner.
final class InboxTests: XCTestCase {

  private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
    try APIClient.decoder.decode(T.self, from: Data(json.utf8))
  }

  private func draft(
    amount: Int = 167_600,
    currency: SupportedCurrency = .TRY,
    contactId: String? = nil,
    contactLabel: String? = "Ada Klinik"
  ) -> TransactionDraft {
    let json = """
    {"kind":"expense","amount":\(amount),"currency":"\(currency.rawValue)",
     "title":"Konaklama","category":null,"subcategory":null,
     "contact_id":\(contactId.map { "\"\($0)\"" } ?? "null"),
     "contact_display_name":null,
     "contact_label":\(contactLabel.map { "\"\($0)\"" } ?? "null"),
     "occurred_on":"2026-09-01","payment_method":null,"description":null}
    """
    return try! decode(TransactionDraft.self, json)
  }

  // MARK: Sözleşme

  func testInboxPageDecodesMessagesEnvelopeAndGroupId() throws {
    let json = """
    {"messages":[
      {"id":"m1","tenant_id":"t","chat_name":"Klinik Muhasebe",
       "chat_id":"1203@g.us","sender":"905551112233@c.us",
       "body":"Dumos Hotel 13.496,88 tl","has_media":false,"media_path":null,
       "status":"parsed","parsed_records":null,"parse_error":null,
       "group_id":"m0","created_at":"2026-09-01T11:03:00.000Z"}
    ],"next_cursor":null}
    """
    let page = try decode(InboxPage.self, json)
    XCTAssertEqual(page.messages.count, 1)
    XCTAssertEqual(page.messages[0].chatId, "1203@g.us")
    XCTAssertEqual(page.messages[0].groupId, "m0")
    XCTAssertEqual(page.messages[0].status, .parsed)
    XCTAssertNil(page.nextCursor)
  }

  func testInboxMessageDecodesParsedDrafts() throws {
    let json = """
    {"id":"m1","tenant_id":"t","chat_name":null,"chat_id":null,"sender":null,
     "body":"Ada Klinik 1.676,00","has_media":false,"media_path":null,
     "status":"parsed","parse_error":null,"group_id":null,
     "created_at":"2026-09-01T11:03:00.000Z",
     "parsed_records":[{"kind":"expense","amount":167600,"currency":"TRY",
       "title":"Ada Klinik","category":null,"subcategory":null,"contact_id":null,
       "contact_display_name":null,"contact_label":"Ada Klinik",
       "occurred_on":"2026-09-01","payment_method":null,"description":null}]}
    """
    let message = try decode(InboundMessage.self, json)
    XCTAssertEqual(message.parsedRecords?.count, 1)
    XCTAssertEqual(message.parsedRecords?[0].amount, 167_600)
    XCTAssertEqual(message.parsedRecords?[0].kind, .expense)
  }

  // MARK: Onay doğrulaması

  func testStatusRequiredBeforeApproval() {
    let form = DraftForm(draft: draft())
    XCTAssertNotNil(form.problem(baseCurrency: .TRY))
    XCTAssertNil(form.toApproveItem(baseCurrency: .TRY))
  }

  func testPaidStatusFillsFullAmount() throws {
    var form = DraftForm(draft: draft())
    form.status = .paid
    XCTAssertNil(form.problem(baseCurrency: .TRY))
    let item = try XCTUnwrap(form.toApproveItem(baseCurrency: .TRY))
    XCTAssertEqual(item.paidAmount, 167_600)
    XCTAssertEqual(item.amountBase, 167_600)
    XCTAssertEqual(item.fxRate, 1)
  }

  func testUnpaidStatusSendsZero() throws {
    var form = DraftForm(draft: draft())
    form.status = .unpaid
    let item = try XCTUnwrap(form.toApproveItem(baseCurrency: .TRY))
    XCTAssertEqual(item.paidAmount, 0)
  }

  func testPartialMustBeBetweenZeroAndAmount() {
    var form = DraftForm(draft: draft(amount: 100_000))
    form.status = .partial

    form.partialPaidText = "0"
    XCTAssertNotNil(form.problem(baseCurrency: .TRY))

    form.partialPaidText = "1000"      // 100.000 kuruş = tam tutar
    XCTAssertNotNil(form.problem(baseCurrency: .TRY))

    form.partialPaidText = "400"       // 40.000 kuruş
    XCTAssertNil(form.problem(baseCurrency: .TRY))
    XCTAssertEqual(form.toApproveItem(baseCurrency: .TRY)?.paidAmount, 40_000)
  }

  func testPartialAcceptsCommaDecimal() {
    var form = DraftForm(draft: draft(amount: 100_000))
    form.status = .partial
    form.partialPaidText = "400,50"
    XCTAssertEqual(form.toApproveItem(baseCurrency: .TRY)?.paidAmount, 40_050)
  }

  func testCounterpartyRequired() {
    var form = DraftForm(draft: draft(contactLabel: nil))
    form.status = .paid
    XCTAssertNotNil(form.problem(baseCurrency: .TRY))

    form.counterpartyLabel = "Ada Klinik"
    XCTAssertNil(form.problem(baseCurrency: .TRY))
  }

  func testContactIdSatisfiesCounterpartyWithoutLabel() {
    var form = DraftForm(draft: draft(contactId: "c1", contactLabel: nil))
    form.status = .paid
    XCTAssertNil(form.problem(baseCurrency: .TRY))
  }

  func testForeignCurrencyNeedsRate() throws {
    var form = DraftForm(draft: draft(amount: 100_000, currency: .EUR))
    form.status = .paid
    XCTAssertNotNil(form.problem(baseCurrency: .TRY))

    form.fxRateText = "47,5"
    XCTAssertNil(form.problem(baseCurrency: .TRY))
    let item = try XCTUnwrap(form.toApproveItem(baseCurrency: .TRY))
    XCTAssertEqual(item.fxRate, 47.5)
    XCTAssertEqual(item.amountBase, 4_750_000)
  }

  func testZeroRateRejected() {
    var form = DraftForm(draft: draft(currency: .EUR))
    form.status = .paid
    form.fxRateText = "0"
    XCTAssertNotNil(form.problem(baseCurrency: .TRY))
  }

  func testApproveItemEncodesSnakeCase() throws {
    var form = DraftForm(draft: draft())
    form.status = .paid
    let item = try XCTUnwrap(form.toApproveItem(baseCurrency: .TRY))
    let data = try APIClient.encoder.encode(item)
    let json = try XCTUnwrap(String(data: data, encoding: .utf8))
    XCTAssertTrue(json.contains("\"paid_amount\""))
    XCTAssertTrue(json.contains("\"amount_base\""))
    XCTAssertTrue(json.contains("\"occurred_on\""))
    XCTAssertTrue(json.contains("\"contact_label\""))
  }
}
