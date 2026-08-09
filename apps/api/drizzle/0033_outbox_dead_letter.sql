-- AUDIT-F09-05: distinguish transient outbox failure from exhausted DLQ.
-- `status` stays unconstrained text (no CHECK on outbox_events historically);
-- add nullable dead_lettered_at only — no backfill.
ALTER TABLE "outbox_events"
	ADD COLUMN "dead_lettered_at" timestamp with time zone;
