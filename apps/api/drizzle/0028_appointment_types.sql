-- Appointment types settings dictionary (GAP-01).
-- appointments.appointment_type stays free-text — no FK in this migration.
-- Default rows are seeded with the same deterministic UUIDs as
-- defaultAppointmentTypeId(tenantId, name) in appointment-type-defaults.ts.
-- Seed runs BEFORE FORCE RLS so the migrator role is not blocked by WITH CHECK.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE "appointment_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_types_tenant_id_tenants_id_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "appointment_types_tenant_id_created_at_idx"
	ON "appointment_types" USING btree ("tenant_id", "created_at" DESC);
--> statement-breakpoint
-- Mirrors Node: SHA-256("appointment-type:{tenantId}:{name}") → UUID v4-shaped bits.
CREATE OR REPLACE FUNCTION app.default_appointment_type_id(p_tenant_id uuid, p_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
	SELECT (
		substr(h, 1, 8) || '-' ||
		substr(h, 9, 4) || '-' ||
		'4' || substr(h, 14, 3) || '-' ||
		'8' || substr(h, 18, 3) || '-' ||
		substr(h, 21, 12)
	)::uuid
	FROM (
		SELECT encode(
			digest('appointment-type:' || p_tenant_id::text || ':' || p_name, 'sha256'),
			'hex'
		) AS h
	) AS hashed;
$$;
--> statement-breakpoint
INSERT INTO appointment_types (id, tenant_id, name, sort_order)
SELECT
	app.default_appointment_type_id(t.id, d.name),
	t.id,
	d.name,
	d.sort_order
FROM tenants t
CROSS JOIN (
	VALUES
		('Konsültasyon', 0),
		('Tedavi', 1),
		('Kontrol', 2),
		('Transfer', 3)
) AS d(name, sort_order)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
ALTER TABLE "appointment_types" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "appointment_types" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "appointment_types_tenant_isolation" ON "appointment_types"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE appointment_types TO verimaya_app;
