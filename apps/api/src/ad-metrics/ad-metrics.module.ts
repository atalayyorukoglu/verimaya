import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { AdMetricsController } from './ad-metrics.controller';
import { AdMetricsService } from './ad-metrics.service';

@Module({
	imports: [AuthModule, CommonModule],
	controllers: [AdMetricsController],
	providers: [AdMetricsService]
})
export class AdMetricsModule {}
