import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { PlatformAdminGuard } from '../platform/platform-admin.guard';
import { CspReportsController } from './csp-reports.controller';
import { CspReportsService } from './csp-reports.service';

@Module({
	imports: [AuthModule, CommonModule],
	controllers: [CspReportsController],
	providers: [CspReportsService, PlatformAdminGuard],
	exports: [CspReportsService]
})
export class CspReportsModule {}
