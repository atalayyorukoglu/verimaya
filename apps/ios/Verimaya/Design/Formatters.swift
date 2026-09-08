import Foundation

/*
 Biçimlendiriciler — `apps/web/src/lib/format.ts` ile BİREBİR aynı çıktı.

 Web tarafı `Intl.*` ile `tr-TR` yerelini kullanır; buradaki `Foundation`
 karşılıkları aynı sonucu üretir (birim testleri `VerimayaTests/FormattersTests`).

 Doğrulanmış eşleşmeler:
   formatMoney(123456, 'TRY')  → "₺1.234,56"   (simge BAŞTA)
   formatDate('2026-09-04…')   → "4 Eyl 2026"
   formatDateTime(…)           → "4 Eyl 16:30"
   formatTime(…)               → "16:30"
   formatPercent(0.53)         → "%53,0"
*/
enum VMFormat {
    static let locale = Locale(identifier: "tr_TR")

    /// Tenant varsayılanı (`apps/web` içinde de `Europe/Istanbul`).
    static let timeZone = TimeZone(identifier: "Europe/Istanbul") ?? .current

    // MARK: Para

    /// `formatMoney(amountMinor, currency)` — tutar minor unit (kuruş) integer.
    static func money(_ minor: Int, currency: String = "TRY") -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = locale
        formatter.currencyCode = currency.uppercased()
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        let major = Double(minor) / 100
        return formatter.string(from: NSNumber(value: major)) ?? "\(major)"
    }

    // MARK: Tarih / saat

    /// `formatDate` — "4 Eyl 2026".
    static func day(_ date: Date, timeZone: TimeZone = VMFormat.timeZone) -> String {
        dateFormatter("d MMM yyyy", timeZone).string(from: date)
    }

    /// `formatDateTime` — "4 Eyl 16:30".
    static func dateTime(_ date: Date, timeZone: TimeZone = VMFormat.timeZone) -> String {
        dateFormatter("d MMM HH:mm", timeZone).string(from: date)
    }

    /// `formatTime` — "16:30".
    static func time(_ date: Date, timeZone: TimeZone = VMFormat.timeZone) -> String {
        dateFormatter("HH:mm", timeZone).string(from: date)
    }

    /// HeaderPeriodPicker etiketi — "Eylül 2026".
    static func monthYear(_ date: Date, timeZone: TimeZone = VMFormat.timeZone) -> String {
        dateFormatter("LLLL yyyy", timeZone).string(from: date)
    }

    /// HeaderPeriodPicker özel aralık ucu — "4 Eyl".
    static func shortDay(_ date: Date, timeZone: TimeZone = VMFormat.timeZone) -> String {
        dateFormatter("d MMM", timeZone).string(from: date)
    }

    /// Rapor sütun etiketi — "Eyl".
    static func shortMonth(_ date: Date, timeZone: TimeZone = VMFormat.timeZone) -> String {
        dateFormatter("MMM", timeZone).string(from: date)
    }

    // MARK: Oran

    /// `formatPercent(fraction, digits)` — 0.53 → "%53,0".
    static func percent(_ fraction: Double, digits: Int = 1) -> String {
        guard fraction.isFinite else { return "—" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .percent
        formatter.locale = locale
        formatter.minimumFractionDigits = digits
        formatter.maximumFractionDigits = digits
        return formatter.string(from: NSNumber(value: fraction)) ?? "—"
    }

    // MARK: Baş harf

    /// `initialsOf` — ad/soyaddan en fazla iki harf, Türkçe büyütme ile.
    static func initials(_ name: String?) -> String {
        let parts = (name ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .split(whereSeparator: { $0.isWhitespace })
        if parts.isEmpty { return "?" }
        return parts.prefix(2)
            .compactMap { $0.first.map(String.init) }
            .joined()
            .uppercased(with: locale)
    }

    private static func dateFormatter(_ format: String, _ timeZone: TimeZone) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.dateFormat = format
        formatter.timeZone = timeZone
        return formatter
    }
}

/// `{count}` gibi yer tutucuları doldurur — web'deki `t('key', { count })` karşılığı.
func vmFill(_ template: String, _ values: [String: String]) -> String {
    var out = template
    for (key, value) in values {
        out = out.replacingOccurrences(of: "{\(key)}", with: value)
    }
    return out
}
