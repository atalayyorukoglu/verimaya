-- EVENT-01 (Faz 4.2): integration_events' uniqueness was global (provider, external_event_id),
-- but the duplicate lookup in webhooks.controller.ts is tenant-scoped (RLS). Two tenants
-- producing the same provider event id could not see each other's row on SELECT, so the
-- second tenant's INSERT hit the global unique constraint and raised 23505, which the
-- controller did not catch -> uncaught -> 500 instead of the intended queue-first 202.
--
-- Widening (provider, external_event_id) -> (tenant_id, provider, external_event_id) is a
-- strictly less restrictive constraint (a superset of columns), so no existing row can
-- possibly violate it — safe with no data cleanup.

DROP INDEX "integration_events_provider_external_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX "integration_events_tenant_provider_external_uidx" ON "integration_events" USING btree ("tenant_id","provider","external_event_id");
