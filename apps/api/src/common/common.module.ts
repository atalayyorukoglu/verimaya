import { Module } from '@nestjs/common';
import { ActiveOrgGuard } from './active-org.guard';
import { CryptoService } from './crypto.service';
import { IdempotencyService } from './idempotency.service';

@Module({
	providers: [ActiveOrgGuard, CryptoService, IdempotencyService],
	exports: [ActiveOrgGuard, CryptoService, IdempotencyService]
})
export class CommonModule {}
