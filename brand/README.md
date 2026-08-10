# Verimaya marka kaynakları

Web’e deploy edilmez. Native app ve tasarım kaynağı.

| Klasör / dosya | Ne için |
| --- | --- |
| `app-icons/` | iOS (Default/Dark/Clear/Tinted) + watchOS Icon Composer çıktıları |
| `source/` | Affinity (`.af`), Icon Composer (`.icon`), katman SVG’leri, kompozisyon varyantları |

PWA PNG’leri / favicon yenilemek (Apple Icon Composer `ios-default-1024.png`):

```bash
# PNGs
sips -z 512 512 brand/app-icons/ios-default-1024.png --out apps/web/static/icon-512.png
sips -z 192 192 brand/app-icons/ios-default-1024.png --out apps/web/static/icon-192.png
sips -z 180 180 brand/app-icons/ios-default-1024.png --out apps/web/static/apple-touch-icon.png
sips -z 32 32 brand/app-icons/ios-default-1024.png --out apps/web/static/favicon-32.png
sips -z 16 16 brand/app-icons/ios-default-1024.png --out apps/web/static/favicon-16.png

# favicon.ico (16/32/48) — Pillow
python3 - <<'PY'
from pathlib import Path
from PIL import Image
src = Image.open('brand/app-icons/ios-default-1024.png').convert('RGBA')
def r(n): return src.resize((n, n), Image.Resampling.LANCZOS)
r(48).save('apps/web/static/favicon.ico', format='ICO', sizes=[(16,16),(32,32),(48,48)], append_images=[r(16), r(32)])
PY
```

Sekme ikonu: `apps/web/static/favicon.ico` (`rel="icon" sizes="any"`). PWA: `icon-192/512` + `manifest.webmanifest`.
