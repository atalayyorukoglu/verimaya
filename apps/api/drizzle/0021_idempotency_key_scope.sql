-- IDEM-01 (Faz 4.1): replay lookup only ever checked `key` (idempotency.service.ts), even
-- though `method`/`path` were already stored — a key reused across two different endpoints
-- replayed the wrong endpoint's response. Widen the identity to
-- tenant_id + key + method + normalized_path and rename `path` -> `normalized_path` so the
-- column documents its own contract (it now always holds a route *template*, e.g.
-- "/v1/patients/:id", never a resolved path with a real id in it).
--
-- No data migration: the old unique index was already (tenant_id, key), so no existing row
-- can violate the new, strictly wider (tenant_id, key, method, normalized_path) index — this
-- can't fail on old data. Old rows keep their pre-migration `path` value (a resolved literal
-- path, e.g. "/v1/patients/<uuid>", not a template) under the renamed column; that's harmless,
-- not incorrect: idempotency keys are single-use tokens minted fresh per mutation
-- (apps/web `apiSend`), so no future request will ever present an old key value again and
-- match one of these rows. Deliberately not truncating — see Faz 4 Görüş for the reasoning;
-- a manual `TRUNCATE TABLE idempotency_keys;` is safe at any time if a clean slate is wanted.

ALTER TABLE "idempotency_keys" RENAME COLUMN "path" TO "normalized_path";
--> statement-breakpoint
DROP INDEX "idempotency_keys_tenant_key_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_tenant_key_method_path_uidx" ON "idempotency_keys" USING btree ("tenant_id","key","method","normalized_path");
