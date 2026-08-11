import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { WebhookSubscriptionsModule } from '../webhook-subscriptions/webhook-subscriptions.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { ContactDataSubjectService } from './contact-data-subject.service';

@Module({
	imports: [AuthModule, CommonModule, WebhookSubscriptionsModule],
	controllers: [ContactsController],
	providers: [ContactsService, ContactDataSubjectService],
	exports: [ContactsService]
})
export class ContactsModule {}
