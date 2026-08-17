import { Module } from '@nestjs/common';
import { LlmModule } from '../integrations/llm';
import { SettingsModule } from '../settings/settings.module';
import { MayaController } from './maya.controller';
import { MayaService } from './maya.service';

@Module({
	imports: [LlmModule, SettingsModule],
	controllers: [MayaController],
	providers: [MayaService]
})
export class MayaModule {}
