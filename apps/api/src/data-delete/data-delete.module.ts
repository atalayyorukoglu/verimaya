import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { TenantModule } from '../tenant/tenant.module';
import { DataDeleteController } from './data-delete.controller';
import { DataDeleteService } from './data-delete.service';

@Module({
	imports: [AuthModule, CommonModule, TenantModule],
	controllers: [DataDeleteController],
	providers: [DataDeleteService],
	exports: [DataDeleteService]
})
export class DataDeleteModule {}
