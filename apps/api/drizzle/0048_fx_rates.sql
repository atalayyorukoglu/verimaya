-- @veri-migration: Global ECB/Frankfurter FX rate cache (no tenant_id, no RLS)
-- INTENTIONAL EXCEPTION to AGENTS.md multi-tenant rule 1:
-- fx_rates is global reference data (ECB rates are identical for every tenant),
-- not business/tenant data. No tenant_id, no RLS — same class of exception as
-- karne_* (see AGENTS.md / docs/MIMARI.md). Do not copy for domain tables.

CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rate_date" date NOT NULL,
	"from_currency" text NOT NULL,
	"to_currency" text NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"provider" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_from_currency_chk" CHECK ("from_currency" IN ('TRY', 'GBP', 'EUR', 'USD')),
	CONSTRAINT "fx_rates_to_currency_chk" CHECK ("to_currency" IN ('TRY', 'GBP', 'EUR', 'USD')),
	CONSTRAINT "fx_rates_rate_positive_chk" CHECK ("rate" > 0),
	CONSTRAINT "fx_rates_provider_chk" CHECK ("provider" IN ('frankfurter'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_date_from_to_uidx" ON "fx_rates" USING btree ("rate_date", "from_currency", "to_currency");
--> statement-breakpoint
COMMENT ON TABLE fx_rates IS 'Global Frankfurter v1/ECB FX cache — no tenant_id, no RLS (intentional; ECB rates are tenant-agnostic reference data; see AGENTS.md)';
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE fx_rates TO verimaya_app;
