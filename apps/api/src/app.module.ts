import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { QueueModule } from './queue/queue.module';
import { TenantModule } from './tenant/tenant.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ContactsModule } from './contacts/contacts.module';
import { PatientsModule } from './patients/patients.module';
import { TransactionsModule } from './transactions/transactions.module';
import { WebhooksModule } from './webhooks/webhooks.module';

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
		PatientsModule,
		ContactsModule,
		AppointmentsModule,
		TransactionsModule,
		WebhooksModule
	]
})
export class AppModule {}
