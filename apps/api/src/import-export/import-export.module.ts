import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { TenantModule } from '../tenant/tenant.module';
import { ImportExportController } from './import-export.controller';
import { ImportExportService } from './import-export.service';

@Module({
	imports: [AuthModule, CommonModule, TenantModule],
	controllers: [ImportExportController],
	providers: [ImportExportService],
	exports: [ImportExportService]
})
export class ImportExportModule {}
