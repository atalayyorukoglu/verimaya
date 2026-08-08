-- OPS-02c follow-up: make fx_rate provenance structural, not conventional.
--
-- A spend_base snapshot only means something next to the currency it is in and
-- the rate it was taken at. A row carrying spend_base without base_currency /
-- fx_rate / fx_dated is a number with no source — exactly the ambiguity OPS-02c
-- was opened for. Clear those rows instead of trusting them: resolveBaseAmount
-- then returns null, the marketing report raises spend_fx_missing ("Kur bilgisi
-- eksik") rather than a wrong ROAS, and the default backfill run refills them.
UPDATE "ad_metrics_daily"
SET "spend_base" = NULL,
	"base_currency" = NULL,
	"fx_rate" = NULL,
	"fx_dated" = NULL
WHERE "spend_base" IS NOT NULL
	AND ("base_currency" IS NULL OR "fx_rate" IS NULL OR "fx_dated" IS NULL);

ALTER TABLE "ad_metrics_daily"
	ADD CONSTRAINT "ad_metrics_daily_fx_snapshot_chk"
		CHECK (
			"spend_base" IS NULL
			OR (
				"base_currency" IS NOT NULL
				AND "fx_rate" IS NOT NULL
				AND "fx_dated" IS NOT NULL
			)
		);
