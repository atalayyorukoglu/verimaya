import { http, HttpResponse } from 'msw';
import type { Tenant, MembershipUser } from '@verimaya/shared';

const demoTenant: Tenant = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Demo Klinik',
	slug: 'demo-klinik',
	base_currency: 'TRY',
	patients_section_label: 'Hastalar',
	created_at: '2026-01-15T10:00:00.000Z'
};

const demoUser: MembershipUser = {
	id: '22222222-2222-4222-8222-222222222222',
	email: 'demo@verimaya.app',
	display_name: 'Demo Kullanıcı',
	created_at: '2026-01-15T10:00:00.000Z',
	tenant_id: demoTenant.id,
	role: 'owner'
};

/** Faz 0a: gerçek /v1 path'leri — faker ile zengin demo veri sonraki oturumda. */
export const handlers = [
	http.get('/v1/me', () => HttpResponse.json(demoUser)),
	http.get('/v1/tenants/current', () => HttpResponse.json(demoTenant)),
	http.get('/v1/patients', () =>
		HttpResponse.json({ items: [], next_cursor: null })
	),
	http.get('/v1/appointments', () =>
		HttpResponse.json({ items: [], next_cursor: null })
	),
	http.get('/v1/transactions', () =>
		HttpResponse.json({ items: [], next_cursor: null })
	),
	http.get('/v1/conversations', () =>
		HttpResponse.json({ items: [], next_cursor: null })
	)
];
