import type { AuditActor } from '../common/audit-helper';

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
export const SET_ACTIVE_PATH = '/organization/set-active';

export type LoginAuditRow = {
	tenantId: string;
	/** Bağlamdan çözülebildiyse dolu; değilse `sessionToken` ile aranır. */
	actor: AuditActor | null;
	sessionToken: string | null;
};

type Belki = Record<string, unknown> | null | undefined;
const nesne = (v: unknown): Belki =>
	v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
const metin = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Hook bağlamından kaydı çıkarır. Şekil beklenenden farklıysa `null` döner —
 * çağıran taraf bunu sessizce geçer: denetim kaydı yazılamadı diye giriş
 * engellenmez.
 */
export function buildLoginAuditRow(ctx: unknown): LoginAuditRow | null {
	const c = nesne(ctx);
	if (!c || metin(c.path) !== SET_ACTIVE_PATH) return null;

	const inner = nesne(c.context);
	// `set-active` oturumu tazeleyip `newSession` = {session, user} kuruyor; after
	// hook'una gelen bağlamda `context.session` DOLU DEĞİL — ilk sürüm bu yüzden her
	// kaydı "Bilinmeyen kullanıcı" diye yazdı. Önce newSession'a bakılır.
	const user = nesne(nesne(inner?.newSession)?.user) ?? nesne(nesne(inner?.session)?.user);
	const returned = nesne(inner?.returned) ?? nesne(c.returned);

	// Aktif firma yanıtta döner; `set-active` null ile çağrılırsa (firmadan çıkış)
	// kimlik olmaz ve kayıt yazılmaz.
	const tenantId = metin(returned?.id);
	if (!tenantId) return null;

	const actorId = metin(user?.id);
	const actorDisplayName = metin(user?.name) ?? metin(user?.email) ?? null;

	return {
		tenantId,
		actor: actorId
			? { actorId, actorDisplayName: actorDisplayName ?? 'Bilinmeyen kullanıcı' }
			: null,
		// Bağlamdan kullanıcı çıkmazsa çağıran taraf bunu kullanıp veritabanından bulur.
		sessionToken: bearerToken(c)
	};
}

/**
 * İstekteki `Authorization: Bearer <token>` değeri. Panel oturumu bearer ile
 * taşıyor; `session.token` ile birebir eşleşiyor.
 *
 * Neden gerekiyor: kullanıcıyı hook bağlamından okumayı iki kez denedim
 * (`context.session`, sonra `context.newSession`), ikisi de after hook'unda boş
 * geldi ve kayıt "Bilinmeyen kullanıcı" olarak düştü. Üçüncü kez tahmin etmek
 * yerine kimliği veritabanından çözüyoruz — orası kesin.
 */
export function bearerToken(ctx: unknown): string | null {
	const c = nesne(ctx);
	const headers = c?.headers;
	const raw =
		headers instanceof Headers
			? headers.get('authorization')
			: metin(nesne(headers)?.authorization);
	const m = /^Bearer\s+(.+)$/i.exec(raw ?? '');
	return m ? m[1]!.trim() : null;
}
