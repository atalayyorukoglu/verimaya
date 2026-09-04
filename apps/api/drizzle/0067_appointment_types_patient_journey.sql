-- Appointment type dictionary: patient-journey defaults (Yeni Hasta / Devam Hastası / RPT).
-- appointments.appointment_type remains free-text — no FK. Old seed names removed from the
-- dictionary only; historical appointment rows keep their stored strings.
-- New IDs use app.default_appointment_type_id (same as appointment-type-defaults.ts).

INSERT INTO appointment_types (id, tenant_id, name, sort_order)
SELECT
	app.default_appointment_type_id(t.id, d.name),
	t.id,
	d.name,
	d.sort_order
FROM tenants t
CROSS JOIN (
	VALUES
		('Yeni Hasta', 0),
		('Devam Hastası', 1),
		('RPT', 2)
) AS d(name, sort_order)
WHERE NOT EXISTS (
	SELECT 1
	FROM appointment_types existing
	WHERE existing.tenant_id = t.id
		AND existing.name = d.name
);
--> statement-breakpoint
UPDATE appointment_types AS at
SET sort_order = d.sort_order
FROM (
	VALUES
		('Yeni Hasta', 0),
		('Devam Hastası', 1),
		('RPT', 2)
) AS d(name, sort_order)
WHERE at.name = d.name;
--> statement-breakpoint
DELETE FROM appointment_types
WHERE name IN ('Konsültasyon', 'Tedavi', 'Kontrol', 'Transfer');
