import type postgres from 'postgres';

type Sql = postgres.Sql;

/**
 * AUDIT-F09-06: with ON DELETE restrict, fixtures can no longer rely on
 * `DELETE FROM tenants` cascading child rows. Wipe known tenant-scoped tables
 * (SET LOCAL so the RLS app role can delete), then drop tenants + organization.
 */
export async function purgeTenantFixtures(sql: Sql, tenantIds: string[]): Promise<void> {
	if (tenantIds.length === 0) return;

	for (const tenantId of tenantIds) {
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			// Child → parent order for intra-tenant FKs
			await tx`delete from scorecard_answers where tenant_id = ${tenantId}`;
			await tx`delete from scorecard_assessments where tenant_id = ${tenantId}`;
			await tx`delete from scorecard_profiles where tenant_id = ${tenantId}`;
			await tx`delete from files where tenant_id = ${tenantId}`;
			await tx`delete from case_notes where tenant_id = ${tenantId}`;
			await tx`delete from operation_alerts where tenant_id = ${tenantId}`;
			await tx`delete from appointments where tenant_id = ${tenantId}`;
			await tx`delete from incentive_files where tenant_id = ${tenantId}`;
			await tx`delete from commission_entries where tenant_id = ${tenantId}`;
			await tx`delete from transactions where tenant_id = ${tenantId}`;
			await tx`delete from contact_data_deletion_requests where tenant_id = ${tenantId}`;
			await tx`delete from contacts where tenant_id = ${tenantId}`;
			await tx`delete from contact_types where tenant_id = ${tenantId}`;
			await tx`delete from appointment_types where tenant_id = ${tenantId}`;
			await tx`delete from finance_categories where tenant_id = ${tenantId}`;
			await tx`delete from organizations where tenant_id = ${tenantId}`;
			await tx`delete from audit_logs where tenant_id = ${tenantId}`;
			await tx`delete from api_keys where tenant_id = ${tenantId}`;
			await tx`delete from ai_corrections where tenant_id = ${tenantId}`;
			await tx`delete from inbound_messages where tenant_id = ${tenantId}`;
			await tx`delete from integration_events where tenant_id = ${tenantId}`;
			await tx`delete from outbox_events where tenant_id = ${tenantId}`;
			await tx`delete from jobs where tenant_id = ${tenantId}`;
			await tx`delete from idempotency_keys where tenant_id = ${tenantId}`;
			await tx`delete from webhook_subscriptions where tenant_id = ${tenantId}`;
			await tx`delete from ad_metrics_daily where tenant_id = ${tenantId}`;
			await tx`delete from tenant_credentials where tenant_id = ${tenantId}`;
			await tx`delete from tenant_provider_identities where tenant_id = ${tenantId}`;
			await tx`delete from tenant_settings where tenant_id = ${tenantId}`;
			await tx`delete from external_ids where tenant_id = ${tenantId}`;
			await tx`delete from data_deletion_requests where tenant_id = ${tenantId}`;
			await tx`delete from demo_notes where tenant_id = ${tenantId}`;
			await tx`delete from user_ui_preferences where organization_id = ${tenantId}`;
			await tx`delete from tenant_permission_overrides where tenant_id = ${tenantId}`;
		});
	}

	await sql`delete from tenants where id in ${sql(tenantIds)}`;
	await sql`delete from organization where id in ${sql(tenantIds)}`;
}
