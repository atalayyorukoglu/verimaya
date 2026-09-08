import Foundation
import Observation

/*
 Raporlar ekranının veri deposu.

 Bütün sayılar SUNUCUDAN gelir — mockup'ta işlem listesinden hesaplanan
 toplamlar artık `/v1/reports/…` uçlarının döndürdüğü değerlerdir. Dönem
 denetimi `from`/`to` olarak her uca geçer.

 Aylık grafik dönemden bağımsızdır: web'deki `monthlyRange` gibi son 6 ayı alır.
*/
@Observable
@MainActor
final class ReportsStore: LoadableStore {
    var summary: ReportSummary?
    var appointmentMetrics: ReportAppointmentMetrics?
    var byCategory: [ReportByCategory.Row] = []
    var monthly: [ReportMonthly.Row] = []
    var statusDistribution: [ReportContactDistribution.StatusRow] = []
    var consistency: [ReportConsistency.Issue] = []
    var marketing: MarketingReport?

    var isLoading = false
    var errorMessage: String?
    var hasLoadedOnce = false

    private let client: APIClient

    init(client: APIClient = .shared) {
        self.client = client
    }

    /// Son 6 takvim ayı (bu ay dahil) — aylık grafiklerin penceresi.
    private var monthlyWindow: (from: String, to: String) {
        let start = Period.monthStart(offset: -5)
        let end = Period.monthEnd(offset: 0)
        return (APIDate.dayKeyString(start), APIDate.dayKeyString(end))
    }

    func reload(from: String?, to: String?) async {
        await run {
            let window = monthlyWindow

            // Paralel çekim: yedi uç birbirini beklemesin.
            async let summaryTask = client.reportSummary(from: from, to: to)
            async let metricsTask = client.reportAppointmentMetrics(from: from, to: to)
            async let categoryTask = client.reportByCategory(from: from, to: to)
            async let monthlyTask = client.reportMonthly(from: window.from, to: window.to)
            async let distributionTask = client.reportContactDistribution(from: from, to: to)
            async let consistencyTask = client.reportConsistency(from: from, to: to)
            async let marketingTask = client.reportMarketing(from: from, to: to)

            // Özet başarısız olursa ekran hata gösterir; ikincil kartlar
            // başarısız olursa yalnız o bölüm boş kalır (rapor tamamen çökmez).
            summary = try await summaryTask
            appointmentMetrics = try? await metricsTask
            byCategory = (try? await categoryTask)?.items ?? []
            monthly = (try? await monthlyTask)?.items ?? []
            statusDistribution = (try? await distributionTask)?.byStatus ?? []
            consistency = (try? await consistencyTask)?.items ?? []
            marketing = try? await marketingTask

            hasLoadedOnce = true
        }
    }

    /// Aylık grafikte gösterilecek 6 kova; sunucudan gelmeyen ay sıfırla doldurulur.
    func monthlyBuckets() -> [(label: String, income: Int, expense: Int, count: Int)] {
        (0..<6).reversed().map { offset in
            let monthStart = Period.monthStart(offset: -offset)
            let key = ReportsStore.monthKey(monthStart)
            let row = monthly.first { $0.month == key }
            return (
                label: VMFormat.shortMonth(monthStart),
                income: row?.incomeBase ?? 0,
                expense: row?.expenseBase ?? 0,
                count: row?.transactionCount ?? 0
            )
        }
    }

    /// Randevu trendi — `appointment-metrics.monthly` üzerinden aynı 6 kova.
    func appointmentBuckets() -> [(label: String, count: Int)] {
        (0..<6).reversed().map { offset in
            let monthStart = Period.monthStart(offset: -offset)
            let key = ReportsStore.monthKey(monthStart)
            let row = appointmentMetrics?.monthly?.first { $0.month == key }
            return (label: VMFormat.shortMonth(monthStart), count: row?.count ?? 0)
        }
    }

    /// `2026-09` — sunucunun aylık kova anahtarı.
    static func monthKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = VMFormat.timeZone
        formatter.dateFormat = "yyyy-MM"
        return formatter.string(from: date)
    }
}
