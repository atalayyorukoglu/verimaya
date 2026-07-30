import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { CommonModule } from '../../common/common.module';
import { SettingsModule } from '../../settings/settings.module';
import { SettingsService } from '../../settings/settings.service';
import { GhlHttpClient, ghlHttpClientEnvConfigured } from './ghl.client.http';
import { GhlClientStub } from './ghl.client.stub';
import { GhlController } from './ghl.controller';
import { GhlOAuthStateService } from './ghl-oauth.state';
import { GhlSyncService } from './ghl.sync.service';
import { GHL_CLIENT, type GhlClient } from './ghl.types';

@Module({
	imports: [AuthModule, CommonModule, SettingsModule],
	controllers: [GhlController],
	providers: [
		GhlSyncService,
		GhlOAuthStateService,
		GhlClientStub,
		{
			provide: GhlHttpClient,
			useFactory: (sync: GhlSyncService, settings: SettingsService) =>
				new GhlHttpClient(sync, settings),
			inject: [GhlSyncService, SettingsService]
		},
		{
			provide: GHL_CLIENT,
			useFactory: (stub: GhlClientStub, http: GhlHttpClient): GhlClient =>
				ghlHttpClientEnvConfigured() ? http : stub,
			inject: [GhlClientStub, GhlHttpClient]
		}
	],
	exports: [GHL_CLIENT, GhlClientStub, GhlSyncService]
})
export class GhlModule {}
