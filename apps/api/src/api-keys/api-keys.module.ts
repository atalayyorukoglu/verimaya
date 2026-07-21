import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { DbModule } from '../db/db.module';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

@Module({
	imports: [AuthModule, CommonModule, DbModule],
	controllers: [ApiKeysController],
	providers: [ApiKeysService, ApiKeyGuard],
	exports: [ApiKeysService, ApiKeyGuard]
})
export class ApiKeysModule {}
