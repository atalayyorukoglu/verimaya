-- SEC-CSP: browser CSP violation aggregates for the panel Report-Only header.
--
-- INTENTIONAL EXCEPTION — this is NOT a tenant/business table:
--   - No tenant_id: the reporting browser has no session, so there is no tenant
--     context to attach. Treating a missing tenant_id as "forgot RLS" would be wrong.
--   - No RLS / FORCE RLS: isolation is not applicable; rows are infra telemetry.
--   - Application access: unauthenticated POST ingest (browser) + platform-admin
--     GET/DELETE only. verimaya_app can read/write because the API process owns ingest.
-- Do not copy this pattern to domain tables.

CREATE TABLE "csp_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_uri" text NOT NULL,
	"blocked_uri" text NOT NULL,
	"violated_directive" text NOT NULL,
	"effective_directive" text,
	"disposition" text,
	"user_agent_family" text,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "csp_reports_document_blocked_directive_uidx" ON "csp_reports" USING btree ("document_uri","blocked_uri","violated_directive");
--> statement-breakpoint
CREATE INDEX "csp_reports_count_last_seen_idx" ON "csp_reports" USING btree ("count","last_seen_at");
--> statement-breakpoint
COMMENT ON TABLE csp_reports IS 'Panel CSP Report-Only aggregates — no tenant_id, no RLS (intentional infra telemetry; see AGENTS.md). Access: unauthenticated ingest + platform admin list/clear.';
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE csp_reports TO verimaya_app;
