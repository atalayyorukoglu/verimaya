import { http, HttpResponse } from 'msw';
import {
	demoTenant,
	demoUser,
	getStore,
	paginate,
	parseScenario,
	type MockScenario
} from './data';

function scenarioFrom(request: Request): MockScenario {
	const url = new URL(request.url);
	const fromQuery = url.searchParams.get('scenario');
	if (fromQuery) return parseScenario(fromQuery);

	const header = request.headers.get('x-mock-scenario');
	if (header) return parseScenario(header);

	if (typeof sessionStorage !== 'undefined') {
		return parseScenario(sessionStorage.getItem('verimaya:mock-scenario'));
	}
	return 'default';
}

function limitFrom(url: URL): number {
	const n = Number(url.searchParams.get('limit') ?? '25');
	return Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 25;
}

export const handlers = [
	http.get('/v1/me', () => HttpResponse.json(demoUser)),
	http.get('/v1/tenants/current', () => HttpResponse.json(demoTenant)),

	http.get('/v1/patients', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
		let items = store.patients;
		if (q) {
			items = items.filter(
				(p) =>
					p.full_name.toLowerCase().includes(q) ||
					(p.email?.toLowerCase().includes(q) ?? false) ||
					(p.phone?.includes(q) ?? false)
			);
		}
		return HttpResponse.json(
			paginate(items, url.searchParams.get('cursor'), limitFrom(url))
		);
	}),

	http.get('/v1/patients/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const patient = store.patients.find((p) => p.id === params.id);
		if (!patient) {
			return HttpResponse.json(
				{
					error: { code: 'not_found', message: 'Hasta bulunamadı' },
					request_id: crypto.randomUUID()
				},
				{ status: 404 }
			);
		}
		return HttpResponse.json(patient);
	}),

	http.get('/v1/appointments', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const sorted = [...store.appointments].sort((a, b) =>
			a.starts_at.localeCompare(b.starts_at)
		);
		return HttpResponse.json(
			paginate(sorted, url.searchParams.get('cursor'), limitFrom(url))
		);
	}),

	http.get('/v1/appointments/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const item = store.appointments.find((a) => a.id === params.id);
		if (!item) {
			return HttpResponse.json(
				{
					error: { code: 'not_found', message: 'Randevu bulunamadı' },
					request_id: crypto.randomUUID()
				},
				{ status: 404 }
			);
		}
		return HttpResponse.json(item);
	}),

	http.get('/v1/transactions', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const sorted = [...store.transactions].sort((a, b) =>
			b.occurred_on.localeCompare(a.occurred_on)
		);
		return HttpResponse.json(
			paginate(sorted, url.searchParams.get('cursor'), limitFrom(url))
		);
	}),

	http.get('/v1/transactions/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const item = store.transactions.find((t) => t.id === params.id);
		if (!item) {
			return HttpResponse.json(
				{
					error: { code: 'not_found', message: 'İşlem bulunamadı' },
					request_id: crypto.randomUUID()
				},
				{ status: 404 }
			);
		}
		return HttpResponse.json(item);
	}),

	http.get('/v1/conversations', ({ request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const sorted = [...store.conversations].sort((a, b) =>
			(b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')
		);
		return HttpResponse.json(
			paginate(sorted, url.searchParams.get('cursor'), limitFrom(url))
		);
	}),

	http.get('/v1/conversations/:id', ({ params, request }) => {
		const store = getStore(scenarioFrom(request));
		const item = store.conversations.find((c) => c.id === params.id);
		if (!item) {
			return HttpResponse.json(
				{
					error: { code: 'not_found', message: 'Konuşma bulunamadı' },
					request_id: crypto.randomUUID()
				},
				{ status: 404 }
			);
		}
		return HttpResponse.json(item);
	}),

	http.get('/v1/conversations/:id/messages', ({ params, request }) => {
		const url = new URL(request.url);
		const store = getStore(scenarioFrom(request));
		const messages = store.messages
			.filter((m) => m.conversation_id === params.id)
			.sort((a, b) => a.sent_at.localeCompare(b.sent_at));
		return HttpResponse.json(
			paginate(messages, url.searchParams.get('cursor'), limitFrom(url))
		);
	})
];
