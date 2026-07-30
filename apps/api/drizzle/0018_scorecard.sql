CREATE TABLE "scorecard_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"band" text NOT NULL,
	"setup_s1" boolean NOT NULL,
	"setup_s2" boolean NOT NULL,
	"setup_s3" boolean NOT NULL,
	"locked_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scorecard_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "scorecard_profiles_tenant_active_uidx" ON "scorecard_profiles" USING btree ("tenant_id") WHERE archived_at is null;
--> statement-breakpoint
CREATE INDEX "scorecard_profiles_tenant_idx" ON "scorecard_profiles" USING btree ("tenant_id");
--> statement-breakpoint
CREATE TABLE "scorecard_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"zero_count" integer,
	"percentage" numeric(6, 2),
	"is_baseline" boolean DEFAULT false NOT NULL,
	"incomparability_warning" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scorecard_assessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "scorecard_assessments_profile_id_scorecard_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "scorecard_profiles"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "scorecard_assessments_tenant_idx" ON "scorecard_assessments" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "scorecard_assessments_profile_idx" ON "scorecard_assessments" USING btree ("profile_id");
--> statement-breakpoint
CREATE TABLE "scorecard_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"criterion_id" text NOT NULL,
	"score" smallint,
	"na_declared" boolean DEFAULT false NOT NULL,
	"evidence_note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scorecard_answers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "scorecard_answers_assessment_id_scorecard_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "scorecard_assessments"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "scorecard_answers_assessment_criterion_uidx" ON "scorecard_answers" USING btree ("assessment_id","criterion_id");
--> statement-breakpoint
CREATE INDEX "scorecard_answers_tenant_idx" ON "scorecard_answers" USING btree ("tenant_id");
--> statement-breakpoint
ALTER TABLE "scorecard_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "scorecard_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "scorecard_profiles_tenant_isolation" ON "scorecard_profiles"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE scorecard_profiles TO verimaya_app;
--> statement-breakpoint
ALTER TABLE "scorecard_assessments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "scorecard_assessments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "scorecard_assessments_tenant_isolation" ON "scorecard_assessments"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE scorecard_assessments TO verimaya_app;
--> statement-breakpoint
ALTER TABLE "scorecard_answers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "scorecard_answers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "scorecard_answers_tenant_isolation" ON "scorecard_answers"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE scorecard_answers TO verimaya_app;
