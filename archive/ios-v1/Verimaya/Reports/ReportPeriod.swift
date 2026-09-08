import Foundation

enum PeriodPreset: String, CaseIterable, Identifiable {
  case buAy
  case gecenAy
  case son90Gun
  case tumZaman

  var id: String { rawValue }

  var label: String {
    switch self {
    case .buAy: "Bu ay"
    case .gecenAy: "Geçen ay"
    case .son90Gun: "Son 90 gün"
    case .tumZaman: "Tüm zaman"
    }
  }

  /// Inclusive calendar range as `YYYY-MM-DD`. `tumZaman` → both nil.
  var range: (from: String?, to: String?) {
    var cal = Calendar(identifier: .gregorian)
    cal.locale = Locale(identifier: "tr_TR")
    cal.timeZone = TimeZone(identifier: "Europe/Istanbul") ?? .current
    let today = cal.startOfDay(for: Date())

    switch self {
    case .tumZaman:
      return (nil, nil)
    case .buAy:
      let comps = cal.dateComponents([.year, .month], from: today)
      let start = cal.date(from: comps) ?? today
      return (Self.dayString(start, calendar: cal), Self.dayString(today, calendar: cal))
    case .gecenAy:
      guard
        let thisMonth = cal.date(from: cal.dateComponents([.year, .month], from: today)),
        let start = cal.date(byAdding: .month, value: -1, to: thisMonth),
        let end = cal.date(byAdding: .day, value: -1, to: thisMonth)
      else { return (nil, nil) }
      return (Self.dayString(start, calendar: cal), Self.dayString(end, calendar: cal))
    case .son90Gun:
      let start = cal.date(byAdding: .day, value: -89, to: today) ?? today
      return (Self.dayString(start, calendar: cal), Self.dayString(today, calendar: cal))
    }
  }

  private static func dayString(_ date: Date, calendar: Calendar) -> String {
    let f = DateFormatter()
    f.calendar = calendar
    f.locale = Locale(identifier: "tr_TR")
    f.timeZone = calendar.timeZone
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
  }
}
