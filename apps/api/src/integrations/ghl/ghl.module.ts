import { Module } from '@nestjs/common';
import { GhlClientStub } from './ghl.client.stub';

@Module({
	providers: [GhlClientStub],
	exports: [GhlClientStub]
})
export class GhlModule {}
