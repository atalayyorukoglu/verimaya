import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { SettingsModule } from '../settings/settings.module';
import { IncentivesController } from './incentives.controller';
import { IncentivesService } from './incentives.service';

@Module({
	imports: [AuthModule, CommonModule, SettingsModule],
	controllers: [IncentivesController],
	providers: [IncentivesService]
})
export class IncentivesModule {}
