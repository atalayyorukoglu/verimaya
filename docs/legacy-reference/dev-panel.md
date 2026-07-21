# Legacy notlar — Developer panel (`/dev-users`)

Kaynak: Fixrav Tracker `/dev-users` (`DevUsersPage`).

## Ne idi?

Platform geliştirici ekranı (e-posta allowlist: `DEV_PANEL_USER_EMAIL` / `dev@fixrav.com`):

- Tüm organizasyonları listele / oluştur / yeniden adlandır / sil
- Hedef org seç (header aktif tenant’tan bağımsız)
- Kullanıcı ekle/güncelle (e-posta, şifre, ad, rol) — davet yok
- Org’dan üye çıkar (kendini çıkaramaz)

## Verimaya

- Demo: `/dev` — sidebar Yönetim → Geliştirici (owner/admin)
- MSW: `/v1/dev/tenants`, `/v1/dev/tenants/:id/users`
- Ana demo tenant silinemez; şifre saklanmaz
- Gerçek erişim: Faz 0b süper-admin / allowlist (tenant admin’e açılmaz)
