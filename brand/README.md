# Verimaya marka kaynakları

Web’e deploy edilmez. Native app ve tasarım kaynağı.

| Klasör / dosya | Ne için |
| --- | --- |
| `app-icons/` | iOS (Default/Dark/Clear/Tinted) + watchOS Icon Composer çıktıları |
| `source/` | Affinity (`.af`), Icon Composer (`.icon`), katman SVG’leri, kompozisyon varyantları |

PWA PNG’leri yenilemek:

```bash
sips -z 512 512 brand/app-icons/ios-default-1024.png --out apps/web/static/icon-512.png
sips -z 192 192 brand/app-icons/ios-default-1024.png --out apps/web/static/icon-192.png
sips -z 180 180 brand/app-icons/ios-default-1024.png --out apps/web/static/apple-touch-icon.png
```
