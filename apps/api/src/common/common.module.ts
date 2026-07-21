import { Module } from '@nestjs/common';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard } from './active-org.guard';
import { AuthOrApiKeyGuard } from './auth-or-api-key.guard';
import { CryptoService } from './crypto.service';
import { IdempotencyService } from './idempotency.service';

@Module({
	providers: [
		ActiveOrgGuard,
		ApiKeyGuard,
		SessionGuard,
		AuthOrApiKeyGuard,
		CryptoService,
		IdempotencyService
	],
	exports: [
		ActiveOrgGuard,
		ApiKeyGuard,
		SessionGuard,
		AuthOrApiKeyGuard,
		CryptoService,
		IdempotencyService
	]
})
export class CommonModule {}
