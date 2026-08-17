import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { LlmModule } from '../integrations/llm';
import { SettingsModule } from '../settings/settings.module';
import { RecordSuggestionsController } from './record-suggestions.controller';
import { RecordSuggestionsService } from './record-suggestions.service';

@Module({
	imports: [AuthModule, CommonModule, LlmModule, SettingsModule, AppointmentsModule],
	controllers: [RecordSuggestionsController],
	providers: [RecordSuggestionsService]
})
export class RecordSuggestionsModule {}
