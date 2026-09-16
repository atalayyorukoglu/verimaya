import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { HeuristicLlmClient } from '../integrations/llm';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { ContactSummaryService } from './contact-summary.service';
import { PatientChecklistService } from './patient-checklist.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
	const { sql } = getDb(databaseUrl);
	await sql`select set_config('app.current_tenant_id', ${tenantId}, false)`;
	try {
		return await fn();
	} finally {
		await sql`select set_config('app.current_tenant_id', '', false)`;
	}
}

/**
 * KISI-01 adım 3: özet yalnız kendi kiracısının kişisi için üretilir ve okunur;
 * kaynak değişmeyince yeniden yazılmaz; `refresh` zorlar.
 */
describe('contact_summaries', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const typeA = randomUUID();
	const claire = randomUUID();
	const msg = randomUUID();
	let service: ContactSummaryService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`cs-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`cs-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`cs-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`cs-b-${tenantB.slice(0, 8)}`})
		`;
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`insert into contact_types (id, tenant_id, name) values (${typeA}, ${tenantA}, 'Hasta')`;
			await tx`
				insert into contacts (id, tenant_id, contact_type_id, contact_type_name, first_name, last_name, display_name)
				values (${claire}, ${tenantA}, ${typeA}, 'Hasta', 'Claire', 'McLeod', 'Claire McLeod')
			`;
			await tx`
				insert into inbound_messages (id, tenant_id, provider, external_id, payload, status)
				values (
					${msg}, ${tenantA}, 'waha', ${`cs-${tenantA.slice(0, 8)}`},
					${JSON.stringify({ payload: { from: '1@g.us', body: 'Claire McLeod 2000 gbp kart ile odeme alindi.' } })}::jsonb,
					'parsed'
				)
			`;
			await tx`
				insert into inbound_message_contacts (tenant_id, inbound_message_id, contact_id, method)
				values (${tenantA}, ${msg}, ${claire}, 'exact')
			`;
			await tx`
				insert into case_notes (tenant_id, contact_id, body, author_display_name)
				values (${tenantA}, ${claire}, 'Hasta eşiyle geldi.', 'Test')
			`;
		});

		const tenantContext = {
			withTenant: async <T>(
				tenantId: string,
				fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>
			) => withTenantSession(tenantId, () => fn({ tx: sql, db }))
		} as TenantContextService;
		service = new ContactSummaryService(
			tenantContext,
			new PatientChecklistService(tenantContext),
			new HeuristicLlmClient()
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('ilk açılışta üretir; her cümle kaynak taşır', async () => {
		const s = await service.get(tenantA, claire, { refresh: false });
		expect(s.contact_id).toBe(claire);
		expect(s.heuristic).toBe(true);
		expect(s.stale).toBe(false);
		expect(s.input_count).toBe(2);
		expect(s.sentences.length).toBeGreaterThan(0);
		for (const c of s.sentences) expect(c.sources.length).toBeGreaterThan(0);
		const kinds = new Set(s.sentences.flatMap((c) => c.sources.map((x) => x.kind)));
		expect(kinds.has('whatsapp')).toBe(true);
		expect(kinds.has('note')).toBe(true);
	});

	it('kaynak değişmeyince aynı özet döner; refresh yeniden yazar', async () => {
		const a = await service.get(tenantA, claire, { refresh: false });
		const b = await service.get(tenantA, claire, { refresh: false });
		expect(b.generated_at).toBe(a.generated_at);
		const c = await service.get(tenantA, claire, { refresh: true });
		expect(c.generated_at).not.toBe(a.generated_at);
	});

	it('kural tabanlı yolda eksik listesi üretilmez', async () => {
		const s = await service.get(tenantA, claire, { refresh: true });
		expect(s.missing).toEqual([]);
	});

	it('KISI-02: hasta akışı şablonu değişince özet bayatlar', async () => {
		const before = await service.get(tenantA, claire, { refresh: true });
		expect(before.stale).toBe(false);

		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`
				insert into tenant_settings (tenant_id, key, value)
				values (${tenantA}, 'patient_flow', ${JSON.stringify({
					narrative: 'Değişmiş akış',
					checklist: [],
					is_default: false,
					updated_by: 'Test',
					updated_at: new Date().toISOString()
				})}::jsonb)
				on conflict (tenant_id, key) do update set value = excluded.value
			`;
		});

		// Şablonun hash'i parmak izine giriyor; soğuma süresi geçmediği için içerik
		// hemen yeniden yazılmaz ama kart "kaynak değişti" der ve Yenile üretir.
		const after = await service.get(tenantA, claire, { refresh: false });
		expect(after.stale).toBe(true);
	});

	it("B, A'nın kişisinin özetini alamaz", async () => {
		await expect(service.get(tenantB, claire, { refresh: false })).rejects.toBeInstanceOf(
			NotFoundException
		);
	});
});
