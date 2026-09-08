import Foundation

/// Uygulama genel yapılandırması.
enum AppConfig {
    /*
     Sunucu adresi. Sıra **bilinçli**:

       1. `VERIMAYA_API_URL` ortam değişkeni — yalnız Xcode'dan / test koşucusundan
          başlatıldığında vardır.
       2. Info.plist'teki `VerimayaAPIURL` — derlemeye gömülü.
       3. `http://localhost:3001` — son çare (yerel API bu portta, 3000 değil).

     Arşiv dersi: ana ekrandan açılan uygulamada ortam değişkeni YOKTUR. Yalnız
     ortam değişkenine bakarsan uygulama cihazda localhost'a bağlanmaya çalışır ve
     hiçbir şey yüklenmez. Bu yüzden Info.plist adımı şart.
    */
    static let apiBaseURL: URL = {
        let candidates = [
            ProcessInfo.processInfo.environment["VERIMAYA_API_URL"],
            Bundle.main.object(forInfoDictionaryKey: "VerimayaAPIURL") as? String,
            "http://localhost:3001"
        ]
        for candidate in candidates {
            guard let trimmed = candidate?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !trimmed.isEmpty,
                  !trimmed.hasPrefix("$("),          // çözülmemiş derleme değişkeni
                  let url = URL(string: trimmed),
                  url.scheme != nil
            else { continue }
            return url
        }
        return URL(string: "http://localhost:3001")!
    }()

    /*
     better-auth (`/v1/auth/…`) durum değiştiren uçlarda Origin denetimi yapar.
     Yerel isteklerin tarayıcı Origin'i yoktur; bu yüzden özel şemalı bir origin
     gönderiyoruz. Sunucunun `TRUSTED_ORIGINS` listesinde tanımlı olmalı
     (prod'a 2026-09-07'de eklendi); yoksa cihazdan giriş 403 `INVALID_ORIGIN` alır.
    */
    static let authOrigin = "verimaya://ios"

    /// Liste uçlarında sayfa boyu.
    static let pageSize = 25
}
