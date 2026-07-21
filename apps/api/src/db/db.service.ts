import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

@Injectable()
export class DbService implements OnModuleDestroy {
	readonly sql: ReturnType<typeof postgres>;
	readonly client: PostgresJsDatabase<typeof schema>;

	constructor(config: ConfigService) {
		const url = config.getOrThrow<string>('DATABASE_URL');
		this.sql = postgres(url, { max: 10 });
		this.client = drizzle(this.sql, { schema });
	}

	async onModuleDestroy() {
		await this.sql.end({ timeout: 5 });
	}
}
