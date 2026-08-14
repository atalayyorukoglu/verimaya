-- @veri-migration: Separate requested FX date from provider rate date
-- INTENTIONAL EXCEPTION to AGENTS.md multi-tenant rule 1:
-- fx_rates is global reference data (ECB rates are identical for every tenant),
-- not business/tenant data. No tenant_id, no RLS — same class of exception as
-- karne_* (see AGENTS.md / docs/MIMARI.md). Do not copy for domain tables.
--
-- The table has no meaningful data yet, so clear it before introducing the
-- required cache-key column. Weekend/holiday requests can share one rate_date.

TRUNCATE TABLE "fx_rates";
--> statement-breakpoint
ALTER TABLE "fx_rates" ADD COLUMN "requested_date" date NOT NULL;
--> statement-breakpoint
DROP INDEX "fx_rates_date_from_to_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_requested_date_from_to_uidx" ON "fx_rates" USING btree ("requested_date", "from_currency", "to_currency");
--> statement-breakpoint
COMMENT ON COLUMN fx_rates.requested_date IS 'Requested calendar day and cache key; may differ from rate_date on weekends/holidays';
--> statement-breakpoint
COMMENT ON COLUMN fx_rates.rate_date IS 'Provider rate day returned for the requested calendar day';
