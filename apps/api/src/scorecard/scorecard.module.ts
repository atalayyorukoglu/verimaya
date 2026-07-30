import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { ScorecardController } from './scorecard.controller';
import { ScorecardService } from './scorecard.service';

@Module({
	imports: [AuthModule, CommonModule],
	controllers: [ScorecardController],
	providers: [ScorecardService],
	exports: [ScorecardService]
})
export class ScorecardModule {}
