/**
 * Env allowlist for platform (super) admins.
 * `PLATFORM_ADMIN_EMAILS=a@x.com,b@y.com` — empty / unset → nobody.
 */

export function parsePlatformAdminEmails(
  raw: string | undefined | null,
): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdminEmail(
  email: string | null | undefined,
  envRaw: string | undefined | null = process.env.PLATFORM_ADMIN_EMAILS,
): boolean {
  if (!email?.trim()) return false;
  return parsePlatformAdminEmails(envRaw).has(email.trim().toLowerCase());
}
