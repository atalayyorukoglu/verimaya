import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { QueueModule } from './queue/queue.module';
import { TenantModule } from './tenant/tenant.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ContactsModule } from './contacts/contacts.module';
import { MembersModule } from './members/members.module';
import { PatientsModule } from './patients/patients.module';
import { TenantsModule } from './tenants/tenants.module';
import { TransactionsModule } from './transactions/transactions.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { SettingsModule } from './settings/settings.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AdMetricsModule } from './ad-metrics/ad-metrics.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { ReportsModule } from './reports/reports.module';
import { WebhookSubscriptionsModule } from './webhook-subscriptions/webhook-subscriptions.module';
import { AdsModule } from './integrations/ads/ads.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: ['.env', '../../.env']
		}),
		DbModule,
		QueueModule,
		TenantModule,
		AuthModule,
		HealthModule,
		TenantsModule,
		MembersModule,
		PatientsModule,
		ContactsModule,
		AppointmentsModule,
		TransactionsModule,
		WebhooksModule,
		WhatsappModule,
		SettingsModule,
		AuditLogsModule,
		AdsModule,
		AdMetricsModule,
		ApiKeysModule,
		ReportsModule,
		WebhookSubscriptionsModule
	]
})
export class AppModule {}
