-- AUDIT-F09-06: tenants soft-delete + FK ON DELETE restrict.
-- Prevents accidental org/tenant hard-delete from cascading away 10y financial rows.
-- Physical DELETE of a tenant that still has child rows is rejected by Postgres;
-- intentional teardown is soft-delete (`deleted_at`). Retention horizons remain LEG-02.

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenants_deleted_at_idx"
	ON "tenants" ("deleted_at")
	WHERE "deleted_at" IS NOT NULL;
--> statement-breakpoint

-- Bridge: tenants.id → organization.id must not CASCADE wipe the tenant row.
ALTER TABLE "tenants" DROP CONSTRAINT "tenants_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_id_organization_id_fk"
	FOREIGN KEY ("id") REFERENCES "organization"("id") ON DELETE restrict;
--> statement-breakpoint

-- Child tables: CASCADE → RESTRICT (tenant with business data cannot be hard-deleted).
ALTER TABLE "ad_metrics_daily" DROP CONSTRAINT "ad_metrics_daily_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "ad_metrics_daily" ADD CONSTRAINT "ad_metrics_daily_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "ai_corrections" DROP CONSTRAINT "ai_corrections_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_corrections" ADD CONSTRAINT "ai_corrections_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "appointment_types" DROP CONSTRAINT "appointment_types_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "appointment_types" ADD CONSTRAINT "appointment_types_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "case_notes" DROP CONSTRAINT "case_notes_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "contact_types" DROP CONSTRAINT "contact_types_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "contact_types" ADD CONSTRAINT "contact_types_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "data_deletion_requests" DROP CONSTRAINT "data_deletion_requests_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "data_deletion_requests" ADD CONSTRAINT "data_deletion_requests_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "demo_notes" DROP CONSTRAINT "demo_notes_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "demo_notes" ADD CONSTRAINT "demo_notes_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "external_ids" DROP CONSTRAINT "external_ids_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "external_ids" ADD CONSTRAINT "external_ids_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT "files_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "finance_categories" DROP CONSTRAINT "finance_categories_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "inbound_messages" DROP CONSTRAINT "inbound_messages_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "integration_events" DROP CONSTRAINT "integration_events_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "scorecard_answers" DROP CONSTRAINT "scorecard_answers_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "scorecard_answers" ADD CONSTRAINT "scorecard_answers_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "scorecard_assessments" DROP CONSTRAINT "scorecard_assessments_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "scorecard_assessments" ADD CONSTRAINT "scorecard_assessments_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "scorecard_profiles" DROP CONSTRAINT "scorecard_profiles_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "scorecard_profiles" ADD CONSTRAINT "scorecard_profiles_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "tenant_credentials" DROP CONSTRAINT "tenant_credentials_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "tenant_credentials" ADD CONSTRAINT "tenant_credentials_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "tenant_provider_identities" DROP CONSTRAINT "tenant_provider_identities_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "tenant_provider_identities" ADD CONSTRAINT "tenant_provider_identities_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "tenant_settings" DROP CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" DROP CONSTRAINT "webhook_subscriptions_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_tenant_id_tenants_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict;
