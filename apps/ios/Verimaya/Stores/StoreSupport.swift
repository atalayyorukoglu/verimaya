import Foundation

/*
 Ekran yükleyicileri için ortak parçalar.

 Her ekranın bir `@Observable` deposu var: istek atar, sonucu ve hata/yükleniyor
 durumunu tutar. Ekranlar depoyu `.task(id:)` ile tetikler — süzgeç ya da dönem
 değişince eski istek iptal olur, yenisi başlar.
*/

/// Dönem → sunucu sorgu parametreleri.
///
/// `tum` seçiliyken `from`/`to` HİÇ gönderilmez; boş dize göndermek 400 döndürür
/// (arşiv dersi #2, canlı API'ye karşı doğrulandı).
extension Period {
    var apiFrom: String? {
        guard let range else { return nil }
        return APIDate.dayKeyString(range.from)
    }

    var apiTo: String? {
        guard let range else { return nil }
        return APIDate.dayKeyString(range.to)
    }

    /// `.task(id:)` için değişim anahtarı.
    var queryKey: String { "\(apiFrom ?? "-")|\(apiTo ?? "-")" }
}

/// Yükleme durumu — her depoda aynı üç alan.
@MainActor
protocol LoadableStore: AnyObject {
    var isLoading: Bool { get set }
    var errorMessage: String? { get set }
}

extension LoadableStore {
    /// Tek yerde hata yakalama: `CancellationError` sessizce yutulur (kullanıcı
    /// süzgeci değiştirdiğinde eski istek iptal edilir, bu bir hata değildir).
    func run(_ work: () async throws -> Void) async {
        isLoading = true
        errorMessage = nil
        do {
            try await work()
        } catch is CancellationError {
            // yeni istek başladı; sessizce çık
        } catch let error as URLError where error.code == .cancelled {
            // aynısı
        } catch {
            errorMessage = APIError.message(from: error)
        }
        isLoading = false
    }
}
