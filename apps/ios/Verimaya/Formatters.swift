import Foundation

/// Money is stored as minor units (kuruş/cent) integers. UI language is Turkish.
enum Money {
  private static let symbols: [String: String] = [
    "TRY": "₺", "GBP": "£", "EUR": "€", "USD": "$"
  ]

  /// 123456 (kuruş) + "TRY" -> "1.234,56 ₺"
  static func format(minor: Int, currency: String = "TRY") -> String {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.locale = Locale(identifier: "tr_TR")
    f.minimumFractionDigits = 2
    f.maximumFractionDigits = 2
    let major = Double(minor) / 100
    let number = f.string(from: NSNumber(value: major)) ?? "0,00"
    let symbol = symbols[currency.uppercased()] ?? currency.uppercased()
    return "\(number) \(symbol)"
  }
}

enum DateFmt {
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

  /// Parse an ISO-8601 UTC datetime (with or without fractional seconds).
  static func parse(_ s: String) -> Date? {
    iso.date(from: s) ?? isoNoFraction.date(from: s)
  }

  /// "22.07.2026" from a YYYY-MM-DD calendar date or ISO datetime.
  static func day(_ s: String) -> String {
    let date: Date?
    if s.count == 10, let d = calendarDay(s) { date = d } else { date = parse(s) }
    guard let date else { return s }
    return display(date, style: .short, time: false)
  }

  /// "22.07.2026 14:30" from an ISO datetime string.
  static func dateTime(_ s: String) -> String {
    guard let date = parse(s) else { return s }
    return display(date, style: .short, time: true)
  }

  private static func calendarDay(_ s: String) -> Date? {
    let f = DateFormatter()
    f.locale = Locale(identifier: "tr_TR")
    f.dateFormat = "yyyy-MM-dd"
    return f.date(from: s)
  }

  private static func display(_ date: Date, style: DateFormatter.Style, time: Bool) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "tr_TR")
    f.dateStyle = style
    f.timeStyle = time ? .short : .none
    return f.string(from: date)
  }
}
