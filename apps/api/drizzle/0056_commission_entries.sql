-- Hakediş / komisyon satırları (commission_entries): tahakkuk ≠ ödeme; formül yok.
CREATE TABLE "commission_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"beneficiary_contact_id" uuid NOT NULL,
	"case_contact_id" uuid,
	"source_transaction_id" uuid,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"amount_base" integer,
	"base_currency" text,
	"fx_rate" numeric(18, 8),
	"fx_dated" date,
	"status" text DEFAULT 'accrued' NOT NULL,
	"earned_on" date NOT NULL,
	"paid_on" date,
	"note" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_entries_status_check" CHECK ("status" IN ('accrued', 'paid', 'cancelled')),
	CONSTRAINT "commission_entries_amount_positive_chk" CHECK ("amount" > 0),
	CONSTRAINT "commission_entries_amount_base_nonneg_chk" CHECK ("amount_base" IS NULL OR "amount_base" >= 0),
	CONSTRAINT "commission_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE restrict,
	CONSTRAINT "commission_entries_beneficiary_contact_id_contacts_id_fk" FOREIGN KEY ("beneficiary_contact_id") REFERENCES "contacts"("id") ON DELETE cascade,
	CONSTRAINT "commission_entries_case_contact_id_contacts_id_fk" FOREIGN KEY ("case_contact_id") REFERENCES "contacts"("id") ON DELETE set null,
	CONSTRAINT "commission_entries_source_transaction_id_transactions_id_fk" FOREIGN KEY ("source_transaction_id") REFERENCES "transactions"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX "commission_entries_tenant_id_beneficiary_contact_id_idx" ON "commission_entries" USING btree ("tenant_id","beneficiary_contact_id");
--> statement-breakpoint
CREATE INDEX "commission_entries_tenant_id_status_idx" ON "commission_entries" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX "commission_entries_tenant_id_earned_on_idx" ON "commission_entries" USING btree ("tenant_id","earned_on");
--> statement-breakpoint
CREATE INDEX "commission_entries_tenant_id_deleted_at_idx" ON "commission_entries" USING btree ("tenant_id","deleted_at");
--> statement-breakpoint
ALTER TABLE "commission_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "commission_entries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "commission_entries_tenant_isolation" ON "commission_entries"
	FOR ALL
	USING (tenant_id = app.current_tenant_id())
	WITH CHECK (tenant_id = app.current_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE commission_entries TO verimaya_app;
