import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

@Module({
	imports: [AuthModule, CommonModule],
	controllers: [MembersController],
	providers: [MembersService]
})
export class MembersModule {}
