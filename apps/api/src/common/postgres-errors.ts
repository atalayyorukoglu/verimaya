/**
 * Shared helper for IDEM-01 (4.1) and EVENT-01 (4.2): both need to catch a Postgres unique
 * violation raised by a specific index and turn it into a graceful re-read instead of a 500.
 * `postgres` (postgres.js) throws plain objects carrying the libpq error fields — `code` is
 * the SQLSTATE (`23505` = unique_violation) and `constraint_name` is the index/constraint that
 * fired. We match on both so an unrelated unique-violation elsewhere in the same transaction
 * doesn't get silently swallowed.
 *
 * Faz 7 denetim bulgusu (F-01): drizzle-orm ≥0.44 her sürücü hatasını `DrizzleQueryError`
 * ("Failed query: …") içine sarar ve gerçek postgres.js hatasını `cause` zincirinde taşır —
 * yani hata nesnesinin *kendisinde* `code`/`constraint_name` yoktur. Yalnız üst seviyeye bakan
 * eski sürüm hiçbir 23505'i tanıyamıyordu, dolayısıyla IDEM-01 ve EVENT-01'in eşzamanlı-yarış
 * kurtarma yolları hiç devreye girmiyor, ham 500 sızıyordu (üç yarış testi de bu yüzden
 * kırmızıydı). Bu yüzden `cause` zincirini geziyoruz; drizzle sarmalayıcıyı kaldırsa veya
 * sürücü doğrudan fırlatsa da aynı şekilde çalışır.
 */
const MAX_CAUSE_DEPTH = 8;

export function isUniqueViolation(err: unknown, constraintName?: string): boolean {
	let current: unknown = err;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
		if (!current || typeof current !== 'object') return false;
		if (matchesUniqueViolation(current, constraintName)) return true;
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}

function matchesUniqueViolation(err: object, constraintName?: string): boolean {
	if ((err as { code?: unknown }).code !== '23505') return false;
	if (!constraintName) return true;
	return (err as { constraint_name?: unknown }).constraint_name === constraintName;
}

/** Postgres SQLSTATE 23503 — foreign_key_violation */
export function isForeignKeyViolation(err: unknown): boolean {
	let current: unknown = err;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
		if (!current || typeof current !== 'object') return false;
		if ((current as { code?: unknown }).code === '23503') return true;
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}
