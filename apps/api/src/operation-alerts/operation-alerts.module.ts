import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { OperationAlertsController } from './operation-alerts.controller';
import { OperationAlertsService } from './operation-alerts.service';

@Module({
	imports: [AuthModule, CommonModule],
	controllers: [OperationAlertsController],
	providers: [OperationAlertsService],
	exports: [OperationAlertsService]
})
export class OperationAlertsModule {}
