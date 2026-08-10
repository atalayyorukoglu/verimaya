#!/usr/bin/env bash
# Cursor CLI (agent -p) arka plan işinin canlı olup olmadığını gösterir.
# Kullanım:  ./scripts/cursor-durum.sh
# agent -p çıktıyı bitene kadar tamponlar, bu yüzden "kıpırdama" ancak
# süreç durumundan ve dosya yazma zamanlarından anlaşılır.

cd "$(dirname "$0")/.." || exit 1

pid=$(pgrep -f "local/bin/agent" | head -1)

if [ -n "$pid" ]; then
	sure=$(ps -o etime= -p "$pid" | tr -d ' ')
	printf '\033[32m● ÇALIŞIYOR\033[0m  (pid %s · %s)\n' "$pid" "$sure"
else
	printf '\033[31m○ SÜREÇ YOK\033[0m  — iş bitti veya durdu\n'
fi

echo
echo "Son 10 dakikada yazılan dosyalar:"
yazilan=$(find apps packages docs -type f -mmin -10 \
	-not -path "*/node_modules/*" \
	-not -path "*/.svelte-kit/*" \
	-not -path "*/dist/*" 2>/dev/null | head -25)

if [ -z "$yazilan" ]; then
	echo "  (yok — henüz okuma/keşif aşamasında olabilir)"
else
	echo "$yazilan" | sed 's|^|  |'
fi

echo
echo "Toplam değişen dosya: $(git status --short | wc -l | tr -d ' ')"
