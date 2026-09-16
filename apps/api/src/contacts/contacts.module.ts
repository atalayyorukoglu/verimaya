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
import { ContactVisitSuggestionsController } from './contact-visit-suggestions.controller';
import { ContactVisitSuggestionsService } from './contact-visit-suggestions.service';
import { ContactVisitsService } from './contact-visits.service';

@Module({
	imports: [AuthModule, CommonModule, GoogleDriveModule, LlmModule, WebhookSubscriptionsModule],
	controllers: [ContactsController, ContactVisitSuggestionsController],
	providers: [
		ContactsService,
		ContactDataSubjectService,
		ContactSummaryService,
		ContactVisitsService,
		ContactVisitSuggestionsService
	],
	exports: [ContactsService, ContactVisitsService, ContactVisitSuggestionsService]
})
export class ContactsModule {}
