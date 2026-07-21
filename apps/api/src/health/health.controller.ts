import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { QueueService } from '../queue/queue.service';

@Controller('health')
export class HealthController {
	constructor(
		private readonly db: DbService,
		private readonly queue: QueueService
	) {}

	@Get()
	async check() {
		await this.db.client.execute(sql`select 1`);
		return {
			status: 'ok',
			service: 'verimaya-api',
			time: new Date().toISOString()
		};
	}

	@Get('ready')
	async ready() {
		await this.db.client.execute(sql`select 1`);

		const redisOk = await this.queue.pingRedis();
		if (!redisOk) {
			throw new ServiceUnavailableException({
				status: 'not_ready',
				checks: {
					postgres: 'ok',
					redis: 'failed'
				}
			});
		}

		return {
			status: 'ready',
			checks: {
				postgres: 'ok',
				redis: 'ok'
			},
			time: new Date().toISOString()
		};
	}
}
