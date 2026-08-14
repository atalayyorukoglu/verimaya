import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { FrankfurterClient } from '../integrations/frankfurter/frankfurter.client';
import { FxController } from './fx.controller';
import { FxService } from './fx.service';

@Module({
	imports: [AuthModule, CommonModule],
	controllers: [FxController],
	providers: [FxService, FrankfurterClient],
	exports: [FxService]
})
export class FxModule {}
