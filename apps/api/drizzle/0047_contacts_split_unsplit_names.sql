-- Repair person contacts where first_name holds the full display_name but last_name was never split.
-- Matches migration 0035 heuristic; display_name stays unchanged.

UPDATE "contacts"
SET
	first_name = split_part(btrim(display_name), ' ', 1),
	last_name = NULLIF(
		btrim(
			substr(
				btrim(display_name),
				char_length(split_part(btrim(display_name), ' ', 1)) + 1
			)
		),
		''
	)
WHERE deleted_at IS NULL
	AND contact_type_name NOT IN ('Klinik', 'Otel', 'Transfer')
	AND display_name IS NOT NULL
	AND btrim(display_name) <> ''
	AND position(' ' in btrim(display_name)) > 0
	AND (
		last_name IS NULL
		OR btrim(first_name) = btrim(display_name)
	);
