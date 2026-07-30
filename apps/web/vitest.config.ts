import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

/** Separate from vite.config.ts so sveltekit() does not load in unit tests. */
export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.{test,spec}.ts']
	},
	resolve: {
		alias: {
			$lib: path.join(root, 'src/lib')
		}
	}
});
