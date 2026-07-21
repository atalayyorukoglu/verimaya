import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { closeDb, getDb, type AppDatabase } from './client';
import type postgres from 'postgres';

@Injectable()
export class DbService implements OnModuleDestroy {
	readonly sql: ReturnType<typeof postgres>;
	readonly client: AppDatabase;

	constructor(config: ConfigService) {
		const url =
			config.get<string>('DATABASE_URL_APP') ?? config.getOrThrow<string>('DATABASE_URL');
		const { sql, db } = getDb(url);
		this.sql = sql;
		this.client = db;
	}

	async onModuleDestroy() {
		await closeDb();
	}
}
