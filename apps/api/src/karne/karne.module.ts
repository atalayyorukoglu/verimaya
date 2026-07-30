import { Module } from '@nestjs/common';
import { KarneController } from './karne.controller';
import { KarneService } from './karne.service';

@Module({
	controllers: [KarneController],
	providers: [KarneService]
})
export class KarneModule {}
