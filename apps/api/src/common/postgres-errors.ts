/**
 * Shared helper for IDEM-01 (4.1) and EVENT-01 (4.2): both need to catch a Postgres unique
 * violation raised by a specific index and turn it into a graceful re-read instead of a 500.
 * `postgres` (postgres.js) throws plain objects carrying the libpq error fields — `code` is
 * the SQLSTATE (`23505` = unique_violation) and `constraint_name` is the index/constraint that
 * fired. We match on both so an unrelated unique-violation elsewhere in the same transaction
 * doesn't get silently swallowed.
 */
export function isUniqueViolation(err: unknown, constraintName?: string): boolean {
	if (!err || typeof err !== 'object') return false;
	const code = (err as { code?: unknown }).code;
	if (code !== '23505') return false;
	if (!constraintName) return true;
	return (err as { constraint_name?: unknown }).constraint_name === constraintName;
}
