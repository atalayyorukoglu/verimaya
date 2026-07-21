import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { QueueModule } from '../queue/queue.module';
import { HealthController } from './health.controller';

@Module({
	imports: [DbModule, QueueModule],
	controllers: [HealthController]
})
export class HealthModule {}
