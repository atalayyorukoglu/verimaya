import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
	imports: [AuthModule, CommonModule],
	controllers: [TenantsController],
	providers: [TenantsService]
})
export class TenantsModule {}
