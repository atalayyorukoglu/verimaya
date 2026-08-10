# TestSprite AI Testing Report (MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** verimaya
- **Date:** 2026-08-09
- **Environment:** `vite preview --host --port 5173` + API `:3000` + `http://app.localhost:5173`
- **Recipe:** production preview + solo cases; MCP init → immediate CLI; config `loginUser`/`loginPassword`

---

## 2️⃣ Requirement Validation Summary

### Passed (13)
TC001 login · TC002 create patient · TC003 edit patient · TC004 schedule appointment · TC005 org→dashboard · TC006 org settings · TC007 create contact · TC009 edit contact · TC010 team role · TC011 hub→login · TC012 update appointment · TC013 API key create/revoke · TC015 contact types

### Blocked / failed (2)
| Case | Status | Why |
| --- | --- | --- |
| TC008 Approve AI finance draft | ⛔ BLOCKED | Empty queue (`Bekleyen mesaj yok.`) — needs draft fixture |
| TC014 Soft-delete patient | ⛔ BLOCKED | **No patient Sil UI** — `Dosyayı düzenle` only İptal/Kaydet; smoke §1 is işlem/kişi/randevu, not hasta |

---

## 3️⃣ Coverage

**13 ✅ / 2 ⛔** on FE plan TC001–TC015 (after TC014 re-run with Düzenle→Sil instructions).

---

## 4️⃣ Key Gaps / Risks
1. Preview + solo batches are required; Vite `dev` + parallel tunnels collapse.
2. TC008 needs an AI draft seed before it is testable.
3. TC014 is a bad/plan-ahead case until patient soft-delete exists — rewrite to kişi/işlem/randevu sil or add patient delete UI.
4. Keep credentials in config; don’t wipe MCP session file.
5. When finished exploring: restore `pnpm destin all` (preview still on 5173 this session).
