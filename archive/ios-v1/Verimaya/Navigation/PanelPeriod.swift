import Foundation

/// Üst şeritteki dönem denetimi — web'deki `HeaderPeriodPicker` gibi sayfanın
/// verisini **gerçekten** süzer. Seçilen ay `from`/`to` takvim günlerine çevrilir
/// (dahil), sunucu süzgeci bunları bekler.
@MainActor
final class PanelPeriod: ObservableObject {
  @Published private(set) var month: Date = Date()

  private let calendar = Calendar.current

  private var interval: DateInterval {
    calendar.dateInterval(of: .month, for: month)
      ?? DateInterval(start: month, duration: 0)
  }

  /// "2026-09-01"
  var from: String { Self.isoDay.string(from: interval.start) }

  /// Ayın son günü — sunucu aralığı **dahil** okuyor, bu yüzden bir gün geri.
  var to: String {
    let last = calendar.date(byAdding: .day, value: -1, to: interval.end) ?? interval.end
    return Self.isoDay.string(from: last)
  }

  /// "Eylül 2026"
  var label: String {
    Self.monthLabel.string(from: month).capitalized(with: Self.locale)
  }

  /// Randevu başlığındaki "2026-09-01 > 2026-09-30".
  var rangeLabel: String { "\(from) > \(to)" }

  func shift(_ months: Int) {
    month = calendar.date(byAdding: .month, value: months, to: month) ?? month
  }

  private static let locale = Locale(identifier: "tr_TR")

  private static let isoDay: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f
  }()

  private static let monthLabel: DateFormatter = {
    let f = DateFormatter()
    f.locale = locale
    f.dateFormat = "LLLL yyyy"
    return f
  }()
}
