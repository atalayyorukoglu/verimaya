import { Module } from '@nestjs/common';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { AuthModule } from '../auth/auth.module';
import { SessionGuard } from '../auth/session.guard';
import { OAuthStateUsedStore } from '../integrations/oauth-state-used.store';
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
		OrgPermissionGuard,
		OAuthStateUsedStore
	],
	exports: [
		ActiveOrgGuard,
		ApiKeyGuard,
		SessionGuard,
		AuthOrApiKeyGuard,
		CryptoService,
		IdempotencyService,
		OrgPermissionGuard,
		OAuthStateUsedStore
	]
})
export class CommonModule {}
