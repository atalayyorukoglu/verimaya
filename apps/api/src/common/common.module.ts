import { Module } from '@nestjs/common';
import { ActiveOrgGuard } from './active-org.guard';
import { IdempotencyService } from './idempotency.service';

@Module({
	providers: [ActiveOrgGuard, IdempotencyService],
	exports: [ActiveOrgGuard, IdempotencyService]
})
export class CommonModule {}
