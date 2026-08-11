import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CryptoService } from '../../common/crypto.service';
import { closeDb, getDb } from '../../db/client';
import { DbService } from '../../db/db.service';
import { SettingsService } from '../../settings/settings.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { DisclosingOutboundMessagePort } from './disclosing-outbound.port';
import { StubOutboundMessagePort } from './outbound.stub';
import { WHATSAPP_OUTBOUND_STUB_JOB_TYPE } from './outbound.port';
import { purgeTenantFixtures } from '../../test/purge-tenant-fixtures';

process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('DisclosingOutboundMessagePort (Adım 24)', () => {
	const tenantId = randomUUID();
	let port: DisclosingOutboundMessagePort;
	let settings: SettingsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Outbound Test', ${`ob-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Outbound Test', ${`ob-${tenantId.slice(0, 8)}`})
		`;

		const dbService = { client: db, sql } as unknown as DbService;
		const tenantContext = new TenantContextService(dbService);
		settings = new SettingsService(tenantContext, new CryptoService());
		const stub = new StubOutboundMessagePort(tenantContext);
		port = new DisclosingOutboundMessagePort(stub, settings, tenantContext);

		await settings.saveAiDisclosure(
			tenantId,
			{ enabled: true, text: 'AI ifşa satırı.' },
			{ actorId: null, actorDisplayName: 'setup' }
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantId]);
		await closeDb();
	});

	it('AI + enabled → disclosure prefix, stub job, audit row', async () => {
		const result = await port.send({
			tenantId,
			to: '120363@g.us',
			body: 'Randevu yarın 10:00',
			origin: 'ai',
			actor: { actorId: null, actorDisplayName: 'ops' }
		});

		expect(result.disclosureApplied).toBe(true);
		expect(result.bodySent.startsWith('AI ifşa satırı.')).toBe(true);
		expect(result.bodySent).toContain('Randevu yarın 10:00');

		const { sql } = getDb(databaseUrl);
		const jobs = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`
				select job_type, status, payload
				from jobs
				where id = ${result.jobId}::uuid
			`;
		});
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.job_type).toBe(WHATSAPP_OUTBOUND_STUB_JOB_TYPE);
		expect(jobs[0]?.status).toBe('completed');
		const payload = jobs[0]?.payload as { body?: string };
		expect(payload.body).toContain('AI ifşa satırı.');

		const audits = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`
				select entity_label, actor_display_name
				from audit_logs
				where tenant_id = ${tenantId}
					and entity_label = 'whatsapp_outbound_disclosure'
			`;
		});
		expect(audits.length).toBeGreaterThanOrEqual(1);
		expect(audits.some((a) => a.actor_display_name === 'ops')).toBe(true);
	});

	it('human origin → body unchanged and no disclosure audit', async () => {
		const before = await countDisclosureAudits();
		const result = await port.send({
			tenantId,
			to: '120363@g.us',
			body: 'Elle yazılan mesaj',
			origin: 'human'
		});
		expect(result.disclosureApplied).toBe(false);
		expect(result.bodySent).toBe('Elle yazılan mesaj');
		expect(await countDisclosureAudits()).toBe(before);
	});

	it('AI + disabled → body unchanged', async () => {
		await settings.saveAiDisclosure(
			tenantId,
			{ enabled: false, text: 'AI ifşa satırı.' },
			{ actorId: null, actorDisplayName: 'setup' }
		);
		const result = await port.send({
			tenantId,
			to: '120363@g.us',
			body: 'Taslak cevap',
			origin: 'ai'
		});
		expect(result.disclosureApplied).toBe(false);
		expect(result.bodySent).toBe('Taslak cevap');
	});

	async function countDisclosureAudits(): Promise<number> {
		const { sql } = getDb(databaseUrl);
		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`
				select count(*)::int as n
				from audit_logs
				where tenant_id = ${tenantId}
					and entity_label = 'whatsapp_outbound_disclosure'
			`;
		});
		return Number(rows[0]?.n ?? 0);
	}
});
