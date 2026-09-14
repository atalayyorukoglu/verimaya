import type { AuditActor } from "../common/audit-helper";

/**
 * Giriş denetim kaydı.
 *
 * `audit_logs.tenant_id` zorunlu; girişin kendisinde ise henüz firma belli değil —
 * better-auth önce oturumu açıyor, firma sonra `organization/set-active` ile
 * seçiliyor. O yüzden kaydı girişte değil, firmanın seçildiği anda yazıyoruz:
 * "bu kullanıcı bu firmanın verisine girdi" sorusunun cevabı zaten budur.
 *
 * `set-active` oturum başına bir kez çağrılıyor (panel yalnız aktif firma yokken
 * çağırıyor — `apps/web/src/lib/auth-org.ts` → `checkOrganizationGate`), o yüzden
 * sayfa yenilemeleri kayıt üretmiyor. Firma değiştirmek de yeni satır yazar;
 * bu istenen davranış.
 */
export const SET_ACTIVE_PATH = "/organization/set-active";

export type LoginAuditRow = { tenantId: string; actor: AuditActor };

type Belki = Record<string, unknown> | null | undefined;
const nesne = (v: unknown): Belki =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : null;
const metin = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * Hook bağlamından kaydı çıkarır. Şekil beklenenden farklıysa `null` döner —
 * çağıran taraf bunu sessizce geçer: denetim kaydı yazılamadı diye giriş
 * engellenmez.
 */
export function buildLoginAuditRow(ctx: unknown): LoginAuditRow | null {
  const c = nesne(ctx);
  if (!c || metin(c.path) !== SET_ACTIVE_PATH) return null;

  const inner = nesne(c.context);
  const session = nesne(inner?.session);
  const user = nesne(session?.user);
  const returned = nesne(inner?.returned) ?? nesne(c.returned);

  // Aktif firma yanıtta döner; `set-active` null ile çağrılırsa (firmadan çıkış)
  // kimlik olmaz ve kayıt yazılmaz.
  const tenantId = metin(returned?.id);
  if (!tenantId) return null;

  const actorId = metin(user?.id);
  const actorDisplayName =
    metin(user?.name) ?? metin(user?.email) ?? "Bilinmeyen kullanıcı";

  return { tenantId, actor: { actorId, actorDisplayName } };
}
