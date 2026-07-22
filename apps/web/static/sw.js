// Minimal PWA service worker for Verimaya.
// Strategy: cache-first for static shell assets, network-first for /v1 API calls,
// navigate requests fall back to /offline.html when offline.
// NEVER registered while MSW is active (see +layout.svelte) — MSW installs its own worker.

const CACHE_VERSION = 'v2';
const CACHE_NAME = `verimaya-shell-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';
const SHELL_ASSETS = [
	'/',
	'/manifest.webmanifest',
	OFFLINE_URL,
	'/icon.svg',
	'/icon-192.png',
	'/icon-512.png'
];

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

function isNavigationRequest(request) {
	return request.mode === 'navigate' || request.destination === 'document';
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

async function navigateWithOfflineFallback(request) {
	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(CACHE_NAME);
			void cache.put(request, response.clone());
		}
		return response;
	} catch {
		const cached = await caches.match(request);
		if (cached) return cached;
		const offline = await caches.match(OFFLINE_URL);
		if (offline) return offline;
		return new Response('Çevrimdışı', {
			status: 503,
			statusText: 'Offline',
			headers: { 'Content-Type': 'text/plain; charset=utf-8' }
		});
	}
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

	if (isNavigationRequest(request)) {
		event.respondWith(navigateWithOfflineFallback(request));
		return;
	}

	event.respondWith(cacheFirst(request));
});
