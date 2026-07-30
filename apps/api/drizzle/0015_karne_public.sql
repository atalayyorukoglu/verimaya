-- Public karne funnel tables — intentional NO tenant_id, NO RLS.
-- See apps/api/src/db/schema/karne-events.ts and docs/MIMARI.md § Değişmez ilkeler.

CREATE TABLE "karne_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"band" text NOT NULL,
	"eu_exposure" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"zero_count" integer,
	"user_agent_family" text,
	"referrer" text
);
--> statement-breakpoint
CREATE INDEX "karne_sessions_started_at_idx" ON "karne_sessions" USING btree ("started_at");
--> statement-breakpoint
CREATE TABLE "karne_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"event_type" text NOT NULL,
	"choice_id" text,
	"dwell_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "karne_events_session_id_karne_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "karne_sessions"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "karne_events_session_question_type_uidx" ON "karne_events" USING btree ("session_id","question_id","event_type");
--> statement-breakpoint
CREATE INDEX "karne_events_session_id_idx" ON "karne_events" USING btree ("session_id");
--> statement-breakpoint
CREATE TABLE "karne_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"email" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "karne_leads_session_id_karne_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "karne_sessions"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "karne_leads_email_uidx" ON "karne_leads" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "karne_leads_session_id_idx" ON "karne_leads" USING btree ("session_id");
--> statement-breakpoint
COMMENT ON TABLE karne_sessions IS 'Public free-scorecard sessions — no tenant_id, no RLS (intentional; see MIMARI.md)';
--> statement-breakpoint
COMMENT ON TABLE karne_events IS 'Public free-scorecard events — no tenant_id, no RLS (intentional; see MIMARI.md)';
--> statement-breakpoint
COMMENT ON TABLE karne_leads IS 'Public free-scorecard email leads — no tenant_id, no RLS (intentional; see MIMARI.md)';
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE karne_sessions TO verimaya_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE karne_events TO verimaya_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE karne_leads TO verimaya_app;
