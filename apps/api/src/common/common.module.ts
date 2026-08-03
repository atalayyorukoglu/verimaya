import { Module } from '@nestjs/common';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { AuthModule } from '../auth/auth.module';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard } from './active-org.guard';
import { AuthOrApiKeyGuard } from './auth-or-api-key.guard';
import { CryptoService } from './crypto.service';
import { IdempotencyService } from './idempotency.service';
import { OrgPermissionGuard } from './org-permission.guard';

@Module({
	imports: [AuthModule],
	providers: [
		ActiveOrgGuard,
		ApiKeyGuard,
		SessionGuard,
		AuthOrApiKeyGuard,
		CryptoService,
		IdempotencyService,
		OrgPermissionGuard
	],
	exports: [
		ActiveOrgGuard,
		ApiKeyGuard,
		SessionGuard,
		AuthOrApiKeyGuard,
		CryptoService,
		IdempotencyService,
		OrgPermissionGuard
	]
})
export class CommonModule {}
