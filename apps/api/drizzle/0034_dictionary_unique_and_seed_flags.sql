-- GAP-F09-25: dictionary hygiene for appointment_types + contact_types
-- (finance_categories already has UNIQUE (tenant_id, kind, name); same seed-flag fix).
--
-- 1) Deduplicate any (tenant_id, name) twins before adding unique indexes
--    (prod expects none — deterministic seeds only — but migration must not fail).
-- 2) UNIQUE (tenant_id, name) on both type tables.
-- 3) Backfill tenant_settings seed markers so existing tenants who already have
--    (or once had) dictionary rows are not re-lazy-seeded after a full delete.

-- ---------------------------------------------------------------------------
-- appointment_types: keep oldest row per (tenant_id, name)
-- ---------------------------------------------------------------------------
DELETE FROM "appointment_types" AS doomed
USING (
	SELECT id
	FROM (
		SELECT
			id,
			ROW_NUMBER() OVER (
				PARTITION BY tenant_id, name
				ORDER BY created_at ASC, id ASC
			) AS rn
		FROM "appointment_types"
	) ranked
	WHERE ranked.rn > 1
) AS extras
WHERE doomed.id = extras.id;
--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_types_tenant_id_name_uidx"
	ON "appointment_types" USING btree ("tenant_id", "name");
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- contact_types: remap contacts off duplicates, then delete extras
-- Prefer the id referenced by the most contacts; ties → oldest created_at.
-- ---------------------------------------------------------------------------
WITH ranked AS (
	SELECT
		ct.id,
		ct.tenant_id,
		ct.name,
		ROW_NUMBER() OVER (
			PARTITION BY ct.tenant_id, ct.name
			ORDER BY
				(
					SELECT count(*)::int
					FROM "contacts" c
					WHERE c.contact_type_id = ct.id
				) DESC,
				ct.created_at ASC,
				ct.id ASC
		) AS rn
	FROM "contact_types" ct
),
keepers AS (
	SELECT id, tenant_id, name FROM ranked WHERE rn = 1
),
dupes AS (
	SELECT r.id AS dupe_id, k.id AS keeper_id
	FROM ranked r
	INNER JOIN keepers k
		ON k.tenant_id = r.tenant_id AND k.name = r.name
	WHERE r.rn > 1
)
UPDATE "contacts" AS c
SET contact_type_id = d.keeper_id
FROM dupes d
WHERE c.contact_type_id = d.dupe_id;
--> statement-breakpoint
DELETE FROM "contact_types" AS doomed
USING (
	SELECT id
	FROM (
		SELECT
			id,
			ROW_NUMBER() OVER (
				PARTITION BY tenant_id, name
				ORDER BY
					(
						SELECT count(*)::int
						FROM "contacts" c
						WHERE c.contact_type_id = contact_types.id
					) DESC,
					created_at ASC,
					id ASC
			) AS rn
		FROM "contact_types"
	) ranked
	WHERE ranked.rn > 1
) AS extras
WHERE doomed.id = extras.id;
--> statement-breakpoint
CREATE UNIQUE INDEX "contact_types_tenant_id_name_uidx"
	ON "contact_types" USING btree ("tenant_id", "name");
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Seed markers for tenants that already have dictionary rows (migration owner
-- bypasses FORCE RLS). Presence of the key = "defaults were applied once".
-- ---------------------------------------------------------------------------
INSERT INTO "tenant_settings" ("id", "tenant_id", "key", "value", "updated_at")
SELECT gen_random_uuid(), src.tenant_id, 'appointment_types_defaults_seeded', 'true'::jsonb, now()
FROM (SELECT DISTINCT tenant_id FROM "appointment_types") AS src
WHERE NOT EXISTS (
	SELECT 1
	FROM "tenant_settings" ts
	WHERE ts.tenant_id = src.tenant_id
		AND ts.key = 'appointment_types_defaults_seeded'
);
--> statement-breakpoint
INSERT INTO "tenant_settings" ("id", "tenant_id", "key", "value", "updated_at")
SELECT gen_random_uuid(), src.tenant_id, 'contact_types_defaults_seeded', 'true'::jsonb, now()
FROM (SELECT DISTINCT tenant_id FROM "contact_types") AS src
WHERE NOT EXISTS (
	SELECT 1
	FROM "tenant_settings" ts
	WHERE ts.tenant_id = src.tenant_id
		AND ts.key = 'contact_types_defaults_seeded'
);
--> statement-breakpoint
INSERT INTO "tenant_settings" ("id", "tenant_id", "key", "value", "updated_at")
SELECT gen_random_uuid(), src.tenant_id, 'finance_categories_defaults_seeded', 'true'::jsonb, now()
FROM (SELECT DISTINCT tenant_id FROM "finance_categories") AS src
WHERE NOT EXISTS (
	SELECT 1
	FROM "tenant_settings" ts
	WHERE ts.tenant_id = src.tenant_id
		AND ts.key = 'finance_categories_defaults_seeded'
);
