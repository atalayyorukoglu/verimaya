import Foundation

/// Parses / formats major-unit money text for form fields (kuruş Int on the wire).
enum MoneyInput {
  /// "1.234,56" or "1234.56" → kuruş. Returns nil if empty/invalid.
  static func moneyMinor(fromMajor text: String) -> Int? {
    var s = text
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: " ", with: "")
      .replacingOccurrences(of: "\u{00A0}", with: "")
      .replacingOccurrences(of: "₺", with: "")
      .replacingOccurrences(of: "£", with: "")
      .replacingOccurrences(of: "€", with: "")
      .replacingOccurrences(of: "$", with: "")
    guard !s.isEmpty else { return nil }

    if s.contains(",") && s.contains(".") {
      // 1.234,56 → thousand=., decimal=,
      s = s.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
    } else if s.contains(",") {
      s = s.replacingOccurrences(of: ",", with: ".")
    }

    guard let value = Double(s), value.isFinite, value >= 0 else { return nil }
    return Int((value * 100).rounded())
  }

  /// Kuruş → editable major text (tr_TR, örn. "1.234,56").
  static func majorText(fromMinor minor: Int) -> String {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.locale = Locale(identifier: "tr_TR")
    f.minimumFractionDigits = 2
    f.maximumFractionDigits = 2
    return f.string(from: NSNumber(value: Double(minor) / 100)) ?? "0,00"
  }
}
