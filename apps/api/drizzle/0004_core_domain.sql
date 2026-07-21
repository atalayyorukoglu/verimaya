-- Faz 1: core domain tables + RLS + search indexes

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- contact_types ----------------------------------------------------------------

CREATE TABLE "contact_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade
);

CREATE INDEX "contact_types_tenant_id_created_at_idx" ON "contact_types" USING btree ("tenant_id", "created_at" DESC);

-- contacts ---------------------------------------------------------------------

CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_type_id" uuid NOT NULL,
	"contact_type_name" text NOT NULL,
	"display_name" text NOT NULL,
	"phone" text,
	"email" text,
	"notes" text,
	"is_internal" boolean DEFAULT false NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "contacts_contact_type_id_contact_types_id_fk" FOREIGN KEY ("contact_type_id") REFERENCES "contact_types"("id") ON DELETE restrict
);

CREATE INDEX "contacts_tenant_id_created_at_idx" ON "contacts" USING btree ("tenant_id", "created_at" DESC);
CREATE INDEX "contacts_tenant_id_contact_type_id_idx" ON "contacts" USING btree ("tenant_id", "contact_type_id");
CREATE INDEX "contacts_display_name_trgm_idx" ON "contacts" USING gin ("display_name" gin_trgm_ops);

-- patients ---------------------------------------------------------------------

CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"email" text,
	"status" text DEFAULT 'lead' NOT NULL,
	"source" text,
	"notes" text,
	"assigned_user_id" uuid,
	"contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "patients_assigned_user_id_user_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "user"("id") ON DELETE set null,
	CONSTRAINT "patients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE set null,
	CONSTRAINT "patients_status_chk" CHECK ("status" IN (
		'lead', 'contacted', 'qualified', 'scheduled', 'arrived',
		'treated', 'follow_up', 'closed_won', 'closed_lost'
	))
);

CREATE INDEX "patients_tenant_id_created_at_idx" ON "patients" USING btree ("tenant_id", "created_at" DESC);
CREATE INDEX "patients_tenant_id_status_updated_at_idx" ON "patients" USING btree ("tenant_id", "status", "updated_at" DESC);
CREATE INDEX "patients_full_name_trgm_idx" ON "patients" USING gin ("full_name" gin_trgm_ops);

-- appointments -----------------------------------------------------------------

CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"patient_display_name" text NOT NULL,
	"title" text,
	"appointment_type" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"clinic_name" text,
	"hotel_name" text,
	"transfer_note" text,
	"clinic_contact_id" uuid,
	"hotel_contact_id" uuid,
	"transfer_contact_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "appointments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE cascade,
	CONSTRAINT "appointments_clinic_contact_id_contacts_id_fk" FOREIGN KEY ("clinic_contact_id") REFERENCES "contacts"("id") ON DELETE set null,
	CONSTRAINT "appointments_hotel_contact_id_contacts_id_fk" FOREIGN KEY ("hotel_contact_id") REFERENCES "contacts"("id") ON DELETE set null,
	CONSTRAINT "appointments_transfer_contact_id_contacts_id_fk" FOREIGN KEY ("transfer_contact_id") REFERENCES "contacts"("id") ON DELETE set null,
	CONSTRAINT "appointments_status_chk" CHECK ("status" IN (
		'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'
	))
);

CREATE INDEX "appointments_tenant_id_created_at_idx" ON "appointments" USING btree ("tenant_id", "created_at" DESC);
CREATE INDEX "appointments_tenant_id_starts_at_idx" ON "appointments" USING btree ("tenant_id", "starts_at");
CREATE INDEX "appointments_tenant_id_patient_id_created_at_idx" ON "appointments" USING btree ("tenant_id", "patient_id", "created_at" DESC);

-- transactions -----------------------------------------------------------------

CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"category" text,
	"occurred_on" date NOT NULL,
	"status" text NOT NULL,
	"invoice_status" text DEFAULT 'none' NOT NULL,
	"payment_method" text,
	"amount" integer NOT NULL,
	"paid_amount" integer,
	"currency" text DEFAULT 'TRY' NOT NULL,
	"amount_base" integer,
	"base_currency" text,
	"fx_rate" numeric(18, 8),
	"fx_dated" date,
	"patient_id" uuid,
	"patient_display_name" text,
	"contact_id" uuid,
	"contact_label" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "transactions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE set null,
	CONSTRAINT "transactions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE set null,
	CONSTRAINT "transactions_kind_chk" CHECK ("kind" IN ('income', 'expense')),
	CONSTRAINT "transactions_status_chk" CHECK ("status" IN ('paid', 'partial', 'unpaid')),
	CONSTRAINT "transactions_invoice_status_chk" CHECK ("invoice_status" IN ('none', 'issued', 'not_issued')),
	CONSTRAINT "transactions_currency_chk" CHECK ("currency" IN ('TRY', 'GBP', 'EUR', 'USD')),
	CONSTRAINT "transactions_base_currency_chk" CHECK (
		"base_currency" IS NULL OR "base_currency" IN ('TRY', 'GBP', 'EUR', 'USD')
	),
	CONSTRAINT "transactions_amount_positive_chk" CHECK ("amount" > 0),
	CONSTRAINT "transactions_paid_amount_nonneg_chk" CHECK ("paid_amount" IS NULL OR "paid_amount" >= 0),
	CONSTRAINT "transactions_amount_base_nonneg_chk" CHECK ("amount_base" IS NULL OR "amount_base" >= 0)
);

CREATE INDEX "transactions_tenant_id_created_at_idx" ON "transactions" USING btree ("tenant_id", "created_at" DESC);
CREATE INDEX "transactions_tenant_id_occurred_on_idx" ON "transactions" USING btree ("tenant_id", "occurred_on" DESC);
CREATE INDEX "transactions_tenant_id_patient_id_created_at_idx" ON "transactions" USING btree ("tenant_id", "patient_id", "created_at" DESC);
CREATE INDEX "transactions_title_trgm_idx" ON "transactions" USING gin ("title" gin_trgm_ops);

-- finance_categories -----------------------------------------------------------

CREATE TABLE "finance_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"subcategories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "finance_categories_kind_chk" CHECK ("kind" IN ('income', 'expense'))
);

CREATE UNIQUE INDEX "finance_categories_tenant_kind_name_uidx" ON "finance_categories" USING btree ("tenant_id", "kind", "name");
CREATE INDEX "finance_categories_tenant_id_created_at_idx" ON "finance_categories" USING btree ("tenant_id", "created_at" DESC);

-- case_notes -------------------------------------------------------------------

CREATE TABLE "case_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "case_notes_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE cascade
);

CREATE INDEX "case_notes_tenant_id_created_at_idx" ON "case_notes" USING btree ("tenant_id", "created_at" DESC);
CREATE INDEX "case_notes_tenant_id_patient_id_created_at_idx" ON "case_notes" USING btree ("tenant_id", "patient_id", "created_at" DESC);

-- files ------------------------------------------------------------------------

CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"appointment_id" uuid,
	"appointment_label" text,
	"filename" text NOT NULL,
	"mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by_user_id" uuid,
	"uploaded_by_display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "files_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE cascade,
	CONSTRAINT "files_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE set null,
	CONSTRAINT "files_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "user"("id") ON DELETE set null,
	CONSTRAINT "files_size_bytes_nonneg_chk" CHECK ("size_bytes" >= 0)
);

CREATE INDEX "files_tenant_id_created_at_idx" ON "files" USING btree ("tenant_id", "created_at" DESC);
CREATE INDEX "files_tenant_id_patient_id_created_at_idx" ON "files" USING btree ("tenant_id", "patient_id", "created_at" DESC);

-- audit_logs -------------------------------------------------------------------

CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_display_name" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
	CONSTRAINT "audit_logs_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE set null,
	CONSTRAINT "audit_logs_action_chk" CHECK ("action" IN ('create', 'update', 'delete', 'login')),
	CONSTRAINT "audit_logs_entity_type_chk" CHECK ("entity_type" IN (
		'patient', 'appointment', 'transaction', 'inbound_message', 'file', 'tenant', 'user'
	))
);

CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs" USING btree ("tenant_id", "created_at" DESC);

-- RLS --------------------------------------------------------------------------

ALTER TABLE contact_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_types FORCE ROW LEVEL SECURITY;
CREATE POLICY contact_types_tenant_isolation ON contact_types
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY contacts_tenant_isolation ON contacts
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;
CREATE POLICY patients_tenant_isolation ON patients
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY appointments_tenant_isolation ON appointments
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY transactions_tenant_isolation ON transactions
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE finance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_categories_tenant_isolation ON finance_categories
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE case_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY case_notes_tenant_isolation ON case_notes
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;
CREATE POLICY files_tenant_isolation ON files
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_tenant_isolation ON audit_logs
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());

-- verimaya_app privileges ------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
	contact_types,
	contacts,
	patients,
	appointments,
	transactions,
	finance_categories,
	case_notes,
	files,
	audit_logs
TO verimaya_app;
