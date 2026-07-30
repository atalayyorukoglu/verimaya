import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { CommonModule } from '../../common/common.module';
import { SettingsModule } from '../../settings/settings.module';
import { GhlClientStub } from './ghl.client.stub';
import { GhlController } from './ghl.controller';
import { GhlOAuthStateService } from './ghl-oauth.state';
import { GhlSyncService } from './ghl.sync.service';

@Module({
	imports: [AuthModule, CommonModule, SettingsModule],
	controllers: [GhlController],
	providers: [GhlClientStub, GhlSyncService, GhlOAuthStateService],
	exports: [GhlClientStub, GhlSyncService]
})
export class GhlModule {}
