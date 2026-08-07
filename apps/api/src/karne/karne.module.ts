import { Module } from '@nestjs/common';
import { createEmailSenderFromEnv, type EmailSender } from '../integrations/email';
import { KarneController } from './karne.controller';
import { EMAIL_SENDER, KarneService } from './karne.service';

@Module({
	controllers: [KarneController],
	providers: [
		{
			provide: EMAIL_SENDER,
			useFactory: (): EmailSender => createEmailSenderFromEnv()
		},
		KarneService
	]
})
export class KarneModule {}
