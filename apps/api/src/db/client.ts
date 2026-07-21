import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type AppDatabase = PostgresJsDatabase<typeof schema>;

let sqlClient: ReturnType<typeof postgres> | null = null;
let dbInstance: AppDatabase | null = null;

export function getDb(databaseUrl = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL) {
	if (!databaseUrl) {
		throw new Error('DATABASE_URL_APP or DATABASE_URL is required');
	}
	if (!sqlClient || !dbInstance) {
		sqlClient = postgres(databaseUrl, { max: 10 });
		dbInstance = drizzle(sqlClient, { schema });
	}
	return { sql: sqlClient, db: dbInstance };
}

export async function closeDb() {
	if (sqlClient) {
		await sqlClient.end({ timeout: 5 });
		sqlClient = null;
		dbInstance = null;
	}
}
