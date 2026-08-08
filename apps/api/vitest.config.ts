import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Load apps/api/.env into process.env before specs evaluate module-level
// DATABASE_URL_APP (Turbo does not load .env; it only passThroughEnv from the host).
loadEnv({ path: '.env' });

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.spec.ts'],
		fileParallelism: false,
		hookTimeout: 30_000,
		testTimeout: 30_000
	}
});
