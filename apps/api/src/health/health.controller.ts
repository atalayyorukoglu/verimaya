import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';

@Controller('health')
export class HealthController {
	constructor(private readonly db: DbService) {}

	@Get()
	async check() {
		await this.db.client.execute(sql`select 1`);
		return {
			status: 'ok',
			service: 'verimaya-api',
			time: new Date().toISOString()
		};
	}
}
