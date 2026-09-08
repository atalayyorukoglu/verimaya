import Foundation
import SwiftUI

/*
 Kabuk durumu — AppShell.svelte'in `$state` değişkenlerinin karşılığı.

 Web'de: `mobileOpen`, `searchOpen`, `accountMenuOpen`, `supportOpen`, tema
 tercihi (`localStorage: verimaya:theme`). Burada da aynısı; tema `AppStorage`
 ile cihazda saklanır (TASARIM.md: varsayılan AÇIK).
*/

/// Alt sekmeler — sıra `navigation.ts` → `mobileTabItems` ile birebir:
/// Finans, Kişiler, Randevular, Raporlar (+ Menü, kabukta).
enum VMTab: String, CaseIterable, Identifiable {
    case finance
    case contacts
    case appointments
    case reports

    var id: String { rawValue }

    var label: String {
        switch self {
        case .finance: return S.Nav.transactions
        case .contacts: return S.Nav.contacts
        case .appointments: return S.Nav.appointments
        case .reports: return S.Nav.reports
        }
    }

    /// Lucide ikonlarının SF Symbols karşılığı (wallet, users, calendar, chart-column).
    var symbol: String {
        switch self {
        case .finance: return "wallet.bifold"
        case .contacts: return "person.2"
        case .appointments: return "calendar"
        case .reports: return "chart.bar"
        }
    }

    /// Bu sayfanın kabuk başlığında dönem denetimi var mı (`bridgePeriod` çağırıyor mu)?
    /// Kişiler çağırmıyor — orada başlıkta dönem gösterilmez.
    var hasPeriod: Bool { self != .contacts }
}

/// Sekme içinden itilen ekranlar.
enum VMRoute: Hashable {
    case aiTransaction
    case account
}

@Observable
final class AppState {
    var tab: VMTab = .finance

    /// Her sekmenin kendi yığını — sekme değişince yerini korur.
    var financePath: [VMRoute] = []
    var contactsPath: [VMRoute] = []
    var appointmentsPath: [VMRoute] = []
    var reportsPath: [VMRoute] = []

    var menuOpen = false
    var accountMenuOpen = false
    var supportOpen = false
    var searchOpen = false

    /// Dönem durumu sayfa başına ayrı — web'de de her sayfa kendi `periodKey`ini tutar.
    var financePeriod = Period(key: .tum)
    var appointmentsPeriod = Period(key: .buAy)
    var reportsPeriod = Period(key: .buAy)

    var theme: VMTheme = .light

    /*
     Ekran görüntüsü almak için başlangıç durumu (yalnız DEBUG).
     Simülatörde `simctl launch ... -vm-tab reports -vm-route account` gibi
     çağrılınca uygulama doğrudan o ekranda açılır — böylece her sekmenin
     görüntüsü elle dokunmadan, tekrarlanabilir biçimde alınabilir.
     Sürüm derlemesinde bu kod yok.
    */
    func applyLaunchArguments() {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        func value(_ flag: String) -> String? {
            guard let index = args.firstIndex(of: flag), args.indices.contains(index + 1) else {
                return nil
            }
            return args[index + 1]
        }
        if let raw = value("-vm-tab"), let parsed = VMTab(rawValue: raw) {
            tab = parsed
        }
        if let raw = value("-vm-route") {
            switch raw {
            case "ai": push(.aiTransaction)
            case "account": push(.account)
            default: break
            }
        }
        if let raw = value("-vm-theme"), let parsed = VMTheme(rawValue: raw) {
            UserDefaults.standard.set(parsed.rawValue, forKey: "verimaya:theme")
        }
        if value("-vm-menu") == "1" {
            menuOpen = true
        }
        if value("-vm-account-menu") == "1" {
            menuOpen = true
            accountMenuOpen = true
        }
        #endif
    }

    /// Kabuk başlığındaki denetim aktif sekmenin dönemini yönetir (period-bridge.svelte).
    var activePeriod: Period? {
        get {
            switch tab {
            case .finance: return financePeriod
            case .appointments: return appointmentsPeriod
            case .reports: return reportsPeriod
            case .contacts: return nil
            }
        }
        set {
            guard let newValue else { return }
            switch tab {
            case .finance: financePeriod = newValue
            case .appointments: appointmentsPeriod = newValue
            case .reports: reportsPeriod = newValue
            case .contacts: break
            }
        }
    }

    var currentPath: [VMRoute] {
        switch tab {
        case .finance: return financePath
        case .contacts: return contactsPath
        case .appointments: return appointmentsPath
        case .reports: return reportsPath
        }
    }

    /// Dönem denetimi yalnız sekmenin kök ekranında görünür (itilen ekranın dönemi yok).
    var showsPeriodControl: Bool { tab.hasPeriod && currentPath.isEmpty }

    func closeMenu() {
        menuOpen = false
        accountMenuOpen = false
    }

    func go(_ tab: VMTab) {
        self.tab = tab
        closeMenu()
    }

    func push(_ route: VMRoute) {
        switch tab {
        case .finance: financePath.append(route)
        case .contacts: contactsPath.append(route)
        case .appointments: appointmentsPath.append(route)
        case .reports: reportsPath.append(route)
        }
    }
}

// MARK: - Dönem

/// `apps/web/src/lib/period-range.ts` → `PeriodKey`.
enum PeriodKey: String, CaseIterable {
    case buAy = "bu-ay"
    case gecenAy = "gecen-ay"
    case tum
    case ozel

    var label: String {
        switch self {
        case .buAy: return S.Reports.Period.thisMonth
        case .gecenAy: return S.Reports.Period.lastMonth
        case .tum: return S.Reports.Period.allTime
        case .ozel: return S.Reports.Period.custom
        }
    }
}

struct Period: Equatable {
    var key: PeriodKey
    var customFrom: Date = MockData.monthStart
    var customTo: Date = Period.monthEnd(offset: 0)

    /// `resolvePeriodRange` karşılığı; `tum` → sınırsız.
    var range: (from: Date, to: Date)? {
        switch key {
        case .buAy: return (Period.monthStart(offset: 0), Period.monthEnd(offset: 0))
        case .gecenAy: return (Period.monthStart(offset: -1), Period.monthEnd(offset: -1))
        case .ozel: return (customFrom, customTo)
        case .tum: return nil
        }
    }

    /// Kabuk başlığındaki etiket (HeaderPeriodPicker):
    /// "tüm zamanlar" | tam ay ise "Eylül 2026" | değilse "1 Eyl – 12 Eyl".
    var headerLabel: String {
        guard let range else { return S.Reports.Period.allTime }
        if isWholeMonth(range.from, range.to) { return VMFormat.monthYear(range.from) }
        return "\(VMFormat.shortDay(range.from)) – \(VMFormat.shortDay(range.to))"
    }

    /// Sayfa içindeki özet satırı ("{period} · {count} randevu" içindeki period).
    var summaryLabel: String { key.label }

    /// Randevular başlığındaki sağ taraf: "2026-09-01 > 2026-09-30".
    var rangeText: String {
        guard let range else { return S.Reports.Period.allTime }
        return "\(Period.dayKey(range.from)) > \(Period.dayKey(range.to))"
    }

    func contains(_ date: Date) -> Bool {
        guard let range else { return true }
        return date >= range.from && date <= range.to
    }

    /// Ok tuşları: hangi dönemde olursak olalım sonuç bir AY aralığıdır.
    mutating func stepMonth(_ delta: Int) {
        let anchor = range?.from ?? MockData.monthStart
        let cal = MockData.calendar
        let base = cal.date(byAdding: .month, value: delta, to: anchor) ?? anchor
        let comps = cal.dateComponents([.year, .month], from: base)
        let start = cal.date(from: comps) ?? base
        customFrom = start
        customTo = Period.endOfMonth(start)
        key = .ozel
    }

    private func isWholeMonth(_ from: Date, _ to: Date) -> Bool {
        let cal = MockData.calendar
        guard cal.component(.day, from: from) == 1 else { return false }
        guard cal.isDate(from, equalTo: to, toGranularity: .month) else { return false }
        return cal.component(.day, from: to) == cal.component(.day, from: Period.endOfMonth(from))
    }

    static func monthStart(offset: Int) -> Date {
        let cal = MockData.calendar
        return cal.date(byAdding: .month, value: offset, to: MockData.monthStart) ?? MockData.monthStart
    }

    static func monthEnd(offset: Int) -> Date {
        endOfMonth(monthStart(offset: offset))
    }

    /// Ayın son günü 23:59:59 — aralık kapsayıcı (web'de `to` gün anahtarı, dahil).
    static func endOfMonth(_ monthStart: Date) -> Date {
        let cal = MockData.calendar
        let next = cal.date(byAdding: .month, value: 1, to: monthStart) ?? monthStart
        return cal.date(byAdding: .second, value: -1, to: next) ?? monthStart
    }

    static func dayKey(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = VMFormat.timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
