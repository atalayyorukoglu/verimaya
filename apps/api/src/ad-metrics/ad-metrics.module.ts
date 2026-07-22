import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { AdsModule } from '../integrations/ads/ads.module';
import { SettingsModule } from '../settings/settings.module';
import { AdMetricsController } from './ad-metrics.controller';
import { AdMetricsService } from './ad-metrics.service';
import { AdMetricsSyncService } from './ad-metrics.sync.service';

@Module({
	imports: [AuthModule, CommonModule, AdsModule, SettingsModule],
	controllers: [AdMetricsController],
	providers: [AdMetricsService, AdMetricsSyncService],
	exports: [AdMetricsSyncService]
})
export class AdMetricsModule {}
