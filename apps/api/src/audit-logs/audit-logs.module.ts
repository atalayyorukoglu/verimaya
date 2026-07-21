import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';

@Module({
	imports: [AuthModule, CommonModule],
	controllers: [AuditLogsController],
	providers: [AuditLogsService]
})
export class AuditLogsModule {}
