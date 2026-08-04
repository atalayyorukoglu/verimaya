-- AUDIT-03 (Faz 8): API key rotation policy.
--
-- 1. last_used_at: written by ApiKeyGuard on every successful lookup. NULL = never
--    used. Used by ops to spot stolen-but-still-valid keys via inactivity.
-- 2. expires_at: NULL = never expires (legacy keys from before this migration; ops
--    should rotate them as they're discovered). New keys default to 90 days from
--    issuance. App.lookup_api_key filters `expires_at IS NULL OR expires_at > now()`.
-- 3. updated_at: needed because the new auto-update trigger fires on writes to
--    last_used_at (and expires_at revocation path), not just created_at updates.
--
-- Existing keys get NULL for both new columns — preserved as "legacy, audit by
-- inactivity" rather than auto-revoked.

ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
-- updatedAt() helper emits `updated_at timestamp with time zone DEFAULT now() NOT NULL`
-- but the table already has createdAt and revokedAt; adding the column is a no-data
-- migration (NULL allowed). Use DEFAULT now() so future writes are non-null.
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();