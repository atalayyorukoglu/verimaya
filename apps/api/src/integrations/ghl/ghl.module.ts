import { Module } from '@nestjs/common';
import { GhlClientStub } from './ghl.client.stub';
import { GhlSyncService } from './ghl.sync.service';

@Module({
	providers: [GhlClientStub, GhlSyncService],
	exports: [GhlClientStub, GhlSyncService]
})
export class GhlModule {}
