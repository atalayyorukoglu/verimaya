import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';

@Module({
	imports: [AuthModule, CommonModule],
	controllers: [CommissionsController],
	providers: [CommissionsService],
	exports: [CommissionsService]
})
export class CommissionsModule {}
