import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { userAgentFamily } from './karne.service';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('karne public tables (no tenant)', () => {
	afterAll(async () => {
		await closeDb();
	});

	it('userAgentFamily returns coarse family only', () => {
		expect(userAgentFamily('Mozilla/5.0 Chrome/120.0.0.0')).toBe('chrome');
		expect(userAgentFamily('Mozilla/5.0 Firefox/121.0')).toBe('firefox');
		expect(userAgentFamily(undefined)).toBeNull();
	});

	it('inserting a session/event does not create tenant-scoped rows', async () => {
		const { sql } = getDb(databaseUrl);

		const patientsBefore = await sql`select count(*)::int as n from contacts`;
		const tenantsBefore = await sql`select count(*)::int as n from tenants`;

		const [session] = await sql`
			insert into karne_sessions (band, eu_exposure, referrer, user_agent_family)
			values ('1-4', 'hayir', 'localhost', 'chrome')
			returning id
		`;

		await sql`
			insert into karne_events (session_id, question_id, event_type, choice_id)
			values (${session!.id}, 's1', 'viewed', null)
			on conflict do nothing
		`;
		await sql`
			insert into karne_events (session_id, question_id, event_type, choice_id)
			values (${session!.id}, 's1', 'viewed', null)
			on conflict do nothing
		`;

		const events = await sql`
			select count(*)::int as n from karne_events where session_id = ${session!.id}
		`;
		expect(events[0]!.n).toBe(1);

		const patientsAfter = await sql`select count(*)::int as n from contacts`;
		const tenantsAfter = await sql`select count(*)::int as n from tenants`;
		expect(patientsAfter[0]!.n).toBe(patientsBefore[0]!.n);
		expect(tenantsAfter[0]!.n).toBe(tenantsBefore[0]!.n);

		await sql`delete from karne_sessions where id = ${session!.id}`;
	});

	it('lead insert is idempotent on email; honeypot rejected by schema', async () => {
		const { sql } = getDb(databaseUrl);
		const { karneLeadCreateSchema } = await import('./karne.schemas');

		const honey = karneLeadCreateSchema.safeParse({
			session_id: '00000000-0000-4000-8000-000000000001',
			email: 'a@b.co',
			consent: true,
			website: 'http://spam.example'
		});
		expect(honey.success).toBe(false);

		const [session] = await sql`
			insert into karne_sessions (band, eu_exposure)
			values ('5-15', 'evet')
			returning id
		`;

		await sql`
			insert into karne_leads (session_id, email, consent_at)
			values (${session!.id}, 'dup@example.com', now())
			on conflict (email) do nothing
		`;
		await sql`
			insert into karne_leads (session_id, email, consent_at)
			values (${session!.id}, 'dup@example.com', now())
			on conflict (email) do nothing
		`;

		const leads = await sql`
			select count(*)::int as n from karne_leads where email = 'dup@example.com'
		`;
		expect(leads[0]!.n).toBe(1);

		await sql`delete from karne_sessions where id = ${session!.id}`;
	});
});
