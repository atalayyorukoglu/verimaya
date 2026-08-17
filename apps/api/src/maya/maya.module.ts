import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { LlmModule } from '../integrations/llm';
import { SettingsModule } from '../settings/settings.module';
import { MayaController } from './maya.controller';
import { MayaService } from './maya.service';

/**
 * Controller guard üçlüsü (AuthOrApiKey + ActiveOrg + OrgPermission) AuthModule ve
 * CommonModule sağlayıcılarına bağlı — ikisi olmadan Nest başlatılırken çöküyor.
 * Desen diğer modüllerle aynı (bkz. IncentivesModule).
 */
@Module({
	imports: [AuthModule, CommonModule, LlmModule, SettingsModule],
	controllers: [MayaController],
	providers: [MayaService]
})
export class MayaModule {}
