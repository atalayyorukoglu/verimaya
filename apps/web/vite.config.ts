import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Unit tests: apps/web/vitest.config.ts (separate — sveltekit() breaks node env).
export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({
				fallback: 'index.html'
			}),
			alias: {
				'@/*': './src/lib/*'
			}
		})
	],
	server: {
		port: 5173,
		strictPort: true,
		// Local host split: localhost = hub, app.localhost = panel (mirrors prod).
		allowedHosts: ['localhost', 'app.localhost'],
		// Same-origin /v1 so session cookies work on app.localhost (PSL: *.localhost ≠ localhost).
		proxy: {
			'/v1': {
				// Override when API_PORT≠3000 (e.g. occupied): API_PROXY_TARGET=http://127.0.0.1:3001
				target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000',
				changeOrigin: true
			}
		}
	},
	// Same host + /v1 proxy for `vite preview` (TestSprite / smoke against production build).
	preview: {
		port: 4173,
		strictPort: true,
		host: true,
		allowedHosts: ['localhost', 'app.localhost'],
		proxy: {
			'/v1': {
				target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000',
				changeOrigin: true
			}
		}
	}
});
