import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

@Module({
	imports: [AuthModule, CommonModule],
	controllers: [ContactsController],
	providers: [ContactsService]
})
export class ContactsModule {}
