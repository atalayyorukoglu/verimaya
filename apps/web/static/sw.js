// Minimal PWA service worker for Verimaya.
// Strategy: cache-first for static shell assets, network-first for /v1 API calls.
// NEVER registered while MSW is active (see +layout.svelte) — MSW installs its own worker.

const CACHE_VERSION = 'v1';
const CACHE_NAME = `verimaya-shell-${CACHE_VERSION}`;
const SHELL_ASSETS = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(SHELL_ASSETS))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
			)
			.then(() => self.clients.claim())
	);
});

function isApiRequest(url) {
	return url.pathname.startsWith('/v1/');
}

async function networkFirst(request) {
	try {
		const response = await fetch(request);
		return response;
	} catch (err) {
		const cached = await caches.match(request);
		if (cached) return cached;
		throw err;
	}
}

async function cacheFirst(request) {
	const cached = await caches.match(request);
	if (cached) return cached;

	const response = await fetch(request);
	if (response.ok && request.method === 'GET') {
		const cache = await caches.open(CACHE_NAME);
		void cache.put(request, response.clone());
	}
	return response;
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (isApiRequest(url)) {
		event.respondWith(networkFirst(request));
		return;
	}

	event.respondWith(cacheFirst(request));
});
