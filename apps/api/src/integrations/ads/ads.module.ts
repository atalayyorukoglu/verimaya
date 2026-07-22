import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { CommonModule } from '../../common/common.module';
import { SettingsModule } from '../../settings/settings.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AdsAdapterRegistry } from './ads-adapter.registry';
import { AdsController } from './ads.controller';
import { AdsOAuthStateService } from './ads-oauth.state';

@Module({
	imports: [AuthModule, CommonModule, SettingsModule, TenantModule],
	controllers: [AdsController],
	providers: [AdsAdapterRegistry, AdsOAuthStateService],
	exports: [AdsAdapterRegistry]
})
export class AdsModule {}
