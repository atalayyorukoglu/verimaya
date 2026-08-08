-- OPS-02c: ad spend FX snapshot (same pattern as transactions FX-01).
-- currency has NO default — must come from the Ads account API (or backfill).
ALTER TABLE "ad_metrics_daily"
	ADD COLUMN "currency" text,
	ADD COLUMN "spend_base" integer,
	ADD COLUMN "base_currency" text,
	ADD COLUMN "fx_rate" numeric(18, 8),
	ADD COLUMN "fx_dated" date;

ALTER TABLE "ad_metrics_daily"
	ADD CONSTRAINT "ad_metrics_daily_currency_chk"
		CHECK ("currency" IS NULL OR "currency" IN ('TRY', 'GBP', 'EUR', 'USD')),
	ADD CONSTRAINT "ad_metrics_daily_base_currency_chk"
		CHECK ("base_currency" IS NULL OR "base_currency" IN ('TRY', 'GBP', 'EUR', 'USD')),
	ADD CONSTRAINT "ad_metrics_daily_spend_base_nonneg_chk"
		CHECK ("spend_base" IS NULL OR "spend_base" >= 0);

-- Prod Google Ads account is TRY (2026-08-08 verification). Do not invent spend_base / FX.
UPDATE "ad_metrics_daily" SET "currency" = 'TRY' WHERE "currency" IS NULL;
