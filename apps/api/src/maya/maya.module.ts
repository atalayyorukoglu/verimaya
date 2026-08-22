import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { ContactsModule } from '../contacts/contacts.module';
import { LlmModule } from '../integrations/llm';
import { ReportsModule } from '../reports/reports.module';
import { SettingsModule } from '../settings/settings.module';
import { MayaController } from './maya.controller';
import { MayaToolsService } from './maya-tools.service';
import { MayaService } from './maya.service';

/**
 * Controller guard üçlüsü (AuthOrApiKey + ActiveOrg + OrgPermission) AuthModule ve
 * CommonModule sağlayıcılarına bağlı — ikisi olmadan Nest başlatılırken çöküyor.
 * Desen diğer modüllerle aynı (bkz. IncentivesModule).
 *
 * AI-11a: araçlar mevcut servisleri **yeniden kullanır** (yeni sorgu yazılmadı), bu
 * yüzden Contacts/Reports/Appointments modülleri de içeri alındı. AuthModule ayrıca
 * araç başına izin çözümü için `MeService` + `PermissionOverridesService` sağlar.
 */
@Module({
	imports: [
		AuthModule,
		CommonModule,
		LlmModule,
		SettingsModule,
		ContactsModule,
		ReportsModule,
		AppointmentsModule
	],
	controllers: [MayaController],
	providers: [MayaService, MayaToolsService]
})
export class MayaModule {}
