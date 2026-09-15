import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { CommonModule } from '../../common/common.module';
import { SettingsModule } from '../../settings/settings.module';
import { TenantModule } from '../../tenant/tenant.module';
import { DriveMirrorEnqueueService } from './drive-mirror-enqueue.service';
import { DriveMirrorService } from './drive-mirror.service';
import { DriveOAuthStateService } from './drive-oauth.state';
import { googleDriveAdapterFromEnv } from './google-drive.adapter';
import { DriveOAuthCallbackController, DriveSettingsController } from './google-drive.controller';
import { DRIVE_CLIENT } from './drive.types';

/**
 * DRIVE-01. `QueueService` bilerek import edilmez: global modülden geç çözülür
 * (bkz. {@link DriveMirrorEnqueueService}) — aksi halde QueueModule ile karşılıklı
 * bağımlılık çıkar.
 */
@Module({
	imports: [AuthModule, CommonModule, SettingsModule, TenantModule],
	controllers: [DriveSettingsController, DriveOAuthCallbackController],
	providers: [
		DriveMirrorService,
		DriveMirrorEnqueueService,
		DriveOAuthStateService,
		{ provide: DRIVE_CLIENT, useFactory: () => googleDriveAdapterFromEnv() }
	],
	exports: [DriveMirrorService, DriveMirrorEnqueueService]
})
export class GoogleDriveModule {}
