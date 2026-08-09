import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { ContactsModule } from '../contacts/contacts.module';
import { LlmModule } from '../integrations/llm';
import { PatientsModule } from '../patients/patients.module';
import { SettingsModule } from '../settings/settings.module';
import { SettingsService } from '../settings/settings.service';
import { TenantModule } from '../tenant/tenant.module';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TransactionsModule } from '../transactions/transactions.module';
import { AiCorrectionsService } from './ai-corrections.service';
import { InboundMessageProcessor } from './inbound-message.processor';
import { DisclosingOutboundMessagePort } from './outbound/disclosing-outbound.port';
import { OUTBOUND_MESSAGE_PORT } from './outbound/outbound.port';
import { StubOutboundMessagePort } from './outbound/outbound.stub';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
	imports: [
		AuthModule,
		CommonModule,
		ContactsModule,
		LlmModule,
		PatientsModule,
		SettingsModule,
		TenantModule,
		TransactionsModule
	],
	controllers: [WhatsappController],
	providers: [
		WhatsappService,
		AiCorrectionsService,
		InboundMessageProcessor,
		StubOutboundMessagePort,
		{
			provide: OUTBOUND_MESSAGE_PORT,
			useFactory: (
				stub: StubOutboundMessagePort,
				settings: SettingsService,
				tenantContext: TenantContextService
			) => new DisclosingOutboundMessagePort(stub, settings, tenantContext),
			inject: [StubOutboundMessagePort, SettingsService, TenantContextService]
		}
	],
	exports: [OUTBOUND_MESSAGE_PORT, WhatsappService, InboundMessageProcessor]
})
export class WhatsappModule {}
