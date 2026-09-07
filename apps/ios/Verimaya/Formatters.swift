import Foundation

/// Web panelindeki `apps/web/src/lib/format.ts` ile birebir aynı biçimler.
/// İkisi de `tr-TR` yerelini kullanır; iOS tarafında karşılığı `Foundation`
/// biçimlendiricileridir.
enum Money {
  private static let locale = Locale(identifier: "tr_TR")

  /// `Intl.NumberFormat('tr-TR', { style: 'currency', currency })` karşılığı:
  /// simge **başta**, ondalık virgül, binlik nokta — "₺1.234,56".
  static func format(minor: Int, currency: String = "TRY") -> String {
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.locale = locale
    f.currencyCode = currency.uppercased()
    f.minimumFractionDigits = 2
    f.maximumFractionDigits = 2
    let major = Double(minor) / 100
    return f.string(from: NSNumber(value: major)) ?? "\(major)"
  }
}

enum DateFmt {
  private static let locale = Locale(identifier: "tr_TR")

  private static let iso: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
  }()
  private static let isoNoFraction: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()

  /// ISO-8601 UTC tarihi (saniye kesri olsun olmasın).
  static func parse(_ s: String) -> Date? {
    iso.date(from: s) ?? isoNoFraction.date(from: s)
  }

  /// `formatDate` karşılığı — "4 Eyl 2026".
  static func day(_ s: String) -> String {
    guard let date = resolve(s) else { return s }
    return template("d MMM yyyy").string(from: date)
  }

  /// `formatDateTime` karşılığı — "4 Eyl 22:35".
  static func dateTime(_ s: String) -> String {
    guard let date = resolve(s) else { return s }
    return template("d MMM HH:mm").string(from: date)
  }

  /// `formatTime` karşılığı — "16:30".
  static func timeOnly(_ s: String) -> String {
    guard let date = resolve(s) else { return s }
    return template("HH:mm").string(from: date)
  }

  private static func resolve(_ s: String) -> Date? {
    if s.count == 10 {
      let f = DateFormatter()
      f.locale = locale
      f.dateFormat = "yyyy-MM-dd"
      return f.date(from: s)
    }
    return parse(s)
  }

  private static func template(_ format: String) -> DateFormatter {
    let f = DateFormatter()
    f.locale = locale
    f.dateFormat = format
    return f
  }
}
