import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { DbModule } from "./db/db.module";
import { HealthModule } from "./health/health.module";
import { QueueModule } from "./queue/queue.module";
import { TenantModule } from "./tenant/tenant.module";
import { AppointmentsModule } from "./appointments/appointments.module";
import { OperationAlertsModule } from "./operation-alerts/operation-alerts.module";
import { RecordSuggestionsModule } from "./record-suggestions/record-suggestions.module";
import { ContactsModule } from "./contacts/contacts.module";
import { MembersModule } from "./members/members.module";
import { TenantsModule } from "./tenants/tenants.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { IncentivesModule } from "./incentives/incentives.module";
import { CommissionsModule } from "./commissions/commissions.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { WhatsappModule } from "./whatsapp/whatsapp.module";
import { MayaModule } from "./maya/maya.module";
import { SettingsModule } from "./settings/settings.module";
import { AuditLogsModule } from "./audit-logs/audit-logs.module";
import { AdMetricsModule } from "./ad-metrics/ad-metrics.module";
import { ApiKeysModule } from "./api-keys/api-keys.module";
import { ReportsModule } from "./reports/reports.module";
import { WebhookSubscriptionsModule } from "./webhook-subscriptions/webhook-subscriptions.module";
import { AdsModule } from "./integrations/ads/ads.module";
import { GhlModule } from "./integrations/ghl/ghl.module";
import { KarneModule } from "./karne/karne.module";
import { ScorecardModule } from "./scorecard/scorecard.module";
import { StorageModule } from "./storage/storage.module";
import { PlatformModule } from "./platform/platform.module";
import { CspReportsModule } from "./csp-reports/csp-reports.module";
import { FxModule } from "./fx/fx.module";
import { ImportExportModule } from "./import-export/import-export.module";
import { DataDeleteModule } from "./data-delete/data-delete.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
    }),
    DbModule,
    StorageModule,
    QueueModule,
    TenantModule,
    AuthModule,
    HealthModule,
    TenantsModule,
    MembersModule,
    ContactsModule,
    AppointmentsModule,
    OperationAlertsModule,
    RecordSuggestionsModule,
    TransactionsModule,
    IncentivesModule,
    CommissionsModule,
    FxModule,
    WebhooksModule,
    WhatsappModule,
    MayaModule,
    SettingsModule,
    ImportExportModule,
    DataDeleteModule,
    AuditLogsModule,
    AdsModule,
    GhlModule,
    AdMetricsModule,
    ApiKeysModule,
    ReportsModule,
    WebhookSubscriptionsModule,
    KarneModule,
    ScorecardModule,
    PlatformModule,
    CspReportsModule,
  ],
})
export class AppModule {}
