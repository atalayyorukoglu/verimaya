import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

let starting: Promise<void> | null = null;

export function startMockWorker() {
	if (typeof window === 'undefined') return Promise.resolve();

	if (!starting) {
		starting = worker
			.start({
				onUnhandledRequest: 'bypass',
				quiet: true,
				serviceWorker: {
					url: '/mockServiceWorker.js'
				}
			})
			.then(() => undefined);
	}

	return starting;
}
