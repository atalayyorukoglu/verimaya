import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { GoogleDriveModule } from '../integrations/google-drive/google-drive.module';
import { LlmModule } from '../integrations/llm';
import { WebhookSubscriptionsModule } from '../webhook-subscriptions/webhook-subscriptions.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { ContactDataSubjectService } from './contact-data-subject.service';
import { ContactSummaryService } from './contact-summary.service';

@Module({
	imports: [AuthModule, CommonModule, GoogleDriveModule, LlmModule, WebhookSubscriptionsModule],
	controllers: [ContactsController],
	providers: [ContactsService, ContactDataSubjectService, ContactSummaryService],
	exports: [ContactsService]
})
export class ContactsModule {}
