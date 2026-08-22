import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import type { MayaToolCall } from '@verimaya/shared';
import { AppointmentsService } from '../appointments/appointments.service';
import { MeService } from '../auth/me.service';
import { PermissionOverridesService } from '../auth/permission-overrides.service';
import { ContactsService } from '../contacts/contacts.service';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import type {
	LlmClient,
	LlmUsageLedger,
	MayaToolSelectionContext,
	MayaToolSelectionResult
} from '../integrations/llm';
import { OperationAlertsService } from '../operation-alerts/operation-alerts.service';
import { ReportsService } from '../reports/reports.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';
import { MayaToolsService, type MayaActor } from './maya-tools.service';
import { MayaService } from './maya.service';
import type { SettingsService } from '../settings/settings.service';

/**
 * AI-11a — canlı veri araçlarının iki sert sınırı, gerçek Postgres üzerinde:
 *
 * 1. **İzin.** `POST /v1/maya/ask` yalnız `settings:read` ister ve bunu her rol geçer.
 *    Bu yüzden finans izni kapatılmış bir temsilci Maya üzerinden `contactBalance`
 *    cevabı ALAMAMALI — alırsa bu bir yetki yükseltme açığıdır.
 * 2. **Tenant izolasyonu.** Tenant A'nın Maya'sı Tenant B'nin kişisini, bakiyesini ve
 *    soru kaydını göremez; modelin uydurduğu bir `contact_ref` de veri çekemez.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

function withTenantSession<T>(tenantId: string, fn: (tdb: TenantDb) => Promise<T>): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
		return fn(tx as TenantDb);
	});
}

function usage(): LlmUsageLedger {
	return {
		provider: 'test',
		model: 'test-maya-router',
		requestedModel: null,
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0,
		estimatedCostUsdMicros: 0,
		path: 'heuristic',
		error: null
	};
}

/** Araç seçimini testin kontrol ettiği sahte model. Rakam üretemez — sözleşmede yok. */
class ScriptedLlm implements LlmClient {
	call: MayaToolCall | null = null;
	lastContext: MayaToolSelectionContext | null = null;
	knowledgeAnswer = 'BILINMIYOR';

	parseTransactionDrafts = vi.fn();
	suggestAppointmentReschedule = vi.fn();

	async answerFromKnowledge() {
		return { answer: this.knowledgeAnswer, heuristic: true, usage: usage() };
	}

	async selectMayaTool(ctx: MayaToolSelectionContext): Promise<MayaToolSelectionResult> {
		this.lastContext = ctx;
		return { call: this.call, usage: usage() };
	}
}

describe('Maya canlı veri araçları — izin + tenant izolasyonu (AI-11a)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const agentUserA = randomUUID();
	const agentUserB = randomUUID();

	let contactA = '';
	let contactB = '';
	let toolsService: MayaToolsService;
	let mayaService: MayaService;
	let overrides: PermissionOverridesService;
	const llm = new ScriptedLlm();

	const actorA: MayaActor = { kind: 'session', userId: agentUserA, requestId: 'req-a' };
	const actorB: MayaActor = { kind: 'session', userId: agentUserB, requestId: 'req-b' };

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Maya A', ${`maya-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Maya B', ${`maya-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug, base_currency)
			values
				(${tenantA}, 'Maya A', ${`maya-a-${tenantA.slice(0, 8)}`}, 'TRY'),
				(${tenantB}, 'Maya B', ${`maya-b-${tenantB.slice(0, 8)}`}, 'TRY')
		`;
		await sql`
			insert into "user" (id, name, email)
			values
				(${agentUserA}, 'Agent A', ${`maya-agent-a-${agentUserA.slice(0, 8)}@example.com`}),
				(${agentUserB}, 'Agent B', ${`maya-agent-b-${agentUserB.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (organization_id, user_id, role, created_at)
			values
				(${tenantA}, ${agentUserA}, 'agent', now()),
				(${tenantB}, ${agentUserB}, 'agent', now())
		`;

		const dbService = { client: db, sql } as unknown as DbService;
		const tenantContext = new TenantContextService(dbService);
		overrides = new PermissionOverridesService(tenantContext);

		const contactsService = new ContactsService(tenantContext, new LocalFileStorage());
		const reportsService = new ReportsService(tenantContext);
		const appointmentsService = new AppointmentsService(
			tenantContext,
			new OperationAlertsService(tenantContext)
		);

		toolsService = new MayaToolsService(
			tenantContext,
			contactsService,
			reportsService,
			appointmentsService,
			new MeService(dbService, tenantContext),
			overrides
		);

		const settings = {
			getKnowledge: async () => ({
				sections: { services: 'Saç ekimi (FUE) — 2.500 EUR.' },
				is_default: false,
				updated_at: null,
				updated_by: null,
				pii_warnings: []
			})
		} as unknown as SettingsService;

		mayaService = new MayaService(settings, llm, toolsService, tenantContext);

		// Kişiler + işlemler: her tenant kendi verisiyle.
		const typeA = await withTenantSession(tenantA, async (tdb) => {
			const rows = await tdb.execute<{ id: string }>(
				drizzleSql`insert into contact_types (tenant_id, name, sort_order) values (${tenantA}, 'Hasta', 0) returning id`
			);
			return rows[0]!.id;
		});
		const typeB = await withTenantSession(tenantB, async (tdb) => {
			const rows = await tdb.execute<{ id: string }>(
				drizzleSql`insert into contact_types (tenant_id, name, sort_order) values (${tenantB}, 'Hasta', 0) returning id`
			);
			return rows[0]!.id;
		});

		contactA = await withTenantSession(tenantA, async (tdb) => {
			const c = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: typeA,
				first_name: 'Zeynep',
				last_name: 'Karaca'
			});
			return c.id;
		});
		contactB = await withTenantSession(tenantB, async (tdb) => {
			const c = await contactsService.createWithDb(tdb, tenantB, {
				contact_type_id: typeB,
				first_name: 'Kerem',
				last_name: 'Aydın'
			});
			return c.id;
		});

		await withTenantSession(tenantA, async (tdb) => {
			await tdb.execute(drizzleSql`
				insert into transactions (tenant_id, kind, occurred_on, status, amount, paid_amount, currency, contact_id, amount_base, base_currency)
				values (${tenantA}, 'income', '2026-08-01', 'partial', 500000, 200000, 'TRY', ${contactA}, 500000, 'TRY')
			`);
		});
		await withTenantSession(tenantB, async (tdb) => {
			await tdb.execute(drizzleSql`
				insert into transactions (tenant_id, kind, occurred_on, status, amount, paid_amount, currency, contact_id, amount_base, base_currency)
				values (${tenantB}, 'income', '2026-08-01', 'unpaid', 900000, 0, 'TRY', ${contactB}, 900000, 'TRY')
			`);
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql`delete from member where organization_id in (${tenantA}, ${tenantB})`;
		await sql`delete from "user" where id in (${agentUserA}, ${agentUserB})`;
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('(a) finans izni kapatılan temsilci contactBalance cevabı ALAMAZ', async () => {
		// Varsayılan matriste her rolde `finance:read` var; izinsizlik yalnız tenant
		// deny override'ıyla oluşur — gerçek üretim yolu bu.
		await overrides.applyChanges(
			tenantA,
			{ changes: [{ role: 'agent', resource: 'finance', action: 'read', allowed: false }] },
			{ actorId: null, actorDisplayName: 'Test' }
		);

		expect(await toolsService.isToolAllowed(tenantA, actorA, 'contactBalance')).toBe(false);
		expect(await toolsService.isToolAllowed(tenantA, actorA, 'openBalances')).toBe(false);
		expect(await toolsService.isToolAllowed(tenantA, actorA, 'periodSummary')).toBe(false);
		// Kişi izni kapatılmadı — o araçlar çalışmaya devam eder.
		expect(await toolsService.isToolAllowed(tenantA, actorA, 'untouchedContacts')).toBe(true);

		llm.call = { tool: 'contactBalance', params: { contact_ref: contactA } };
		const res = await mayaService.ask(
			tenantA,
			{ question: 'Zeynep Karaca ne kadar borçlu?' },
			actorA
		);

		expect(res.grounded).toBe(false);
		expect(res.tool_result).toBeNull();
		expect(res.answer).toBe('');
		// "Yetkin yok" bile denmiyor: hangi araç denendiği de sızmıyor.
		expect(res.tool).toBeNull();
	});

	it('(a2) deny override başka tenant\'a taşmaz — aynı rol Tenant B\'de cevap alır', async () => {
		expect(await toolsService.isToolAllowed(tenantB, actorB, 'contactBalance')).toBe(true);

		llm.call = { tool: 'contactBalance', params: { contact_ref: contactB } };
		const res = await mayaService.ask(tenantB, { question: 'Kerem Aydın borcu?' }, actorB);

		expect(res.source).toBe('tool');
		expect(res.tool).toBe('contactBalance');
		expect(res.tool_result).toMatchObject({
			tool: 'contactBalance',
			contact_id: contactB,
			outstanding_base: 900000
		});
	});

	it('(b) Tenant A, Tenant B\'nin kişisini çözemez ve bakiyesini göremez', async () => {
		const candidates = await toolsService.findContactCandidates(tenantA, 'Kerem Aydın borcu?');
		expect(candidates).toEqual([]);

		// Model B tenant\'ının contact_ref\'ini uydursa bile araç çalışmaz: sunucunun
		// çözdüğü eşleşme listesinde yok.
		const result = await toolsService.run(
			tenantA,
			{ tool: 'contactBalance', params: { contact_ref: contactB } },
			[]
		);
		expect(result).toBeNull();

		// openBalances yalnız kendi tenant\'ının satırlarını görür (RLS + withTenant).
		const balancesA = await toolsService.run(tenantA, { tool: 'openBalances', params: {} }, []);
		expect(balancesA).not.toBeNull();
		const items = balancesA!.tool === 'openBalances' ? balancesA!.items : [];
		expect(items.every((row) => row.contact_id !== contactB)).toBe(true);
		expect(items.some((row) => row.contact_id === contactA)).toBe(true);
	});

	it('(c0) model kendi tenant\'ındaki başka bir kişiyi seçemez — sunucu izin listesi', async () => {
		// `contactA` geçerli bir Tenant A kişisi; ama soruyu sunucu ona çözmediyse
		// model onu seçerek bakiye okuyamaz. RLS burada devreye girmez (aynı tenant),
		// koruma yalnız bu izin listesidir.
		expect(
			await toolsService.run(
				tenantA,
				{ tool: 'contactBalance', params: { contact_ref: contactA } },
				[]
			)
		).toBeNull();

		const allowed = await toolsService.run(
			tenantA,
			{ tool: 'contactBalance', params: { contact_ref: contactA } },
			[{ id: contactA, displayName: 'Zeynep Karaca', token: 'KISI_1' }]
		);
		expect(allowed).toMatchObject({ tool: 'contactBalance', outstanding_base: 300000 });
	});

	it('(c) modelin uydurduğu contact_ref ile veri çekilemez', async () => {
		const fabricated: MayaToolCall = {
			tool: 'contactBalance',
			params: { contact_ref: randomUUID() }
		};
		expect(await toolsService.run(tenantA, fabricated, [])).toBeNull();
	});

	it('(d) araç eşleşmezse bilgi bankası yoluna düşer, o da bilmiyorsa BILINMIYOR', async () => {
		llm.call = null;
		llm.knowledgeAnswer = 'BILINMIYOR';
		const res = await mayaService.ask(tenantA, { question: 'Bugün hava nasıl?' }, actorA);

		expect(res.grounded).toBe(false);
		expect(res.source).toBe('unknown');
		expect(res.tool).toBeNull();
		expect(res.tool_result).toBeNull();
	});

	it('(d2) bilgi bankası yolu bozulmadı — fiyat sorusu hâlâ cevaplanıyor', async () => {
		llm.call = null;
		llm.knowledgeAnswer = 'Saç ekimi (FUE) — 2.500 EUR.';
		const res = await mayaService.ask(tenantA, { question: 'Saç ekimi fiyatımız ne?' }, actorA);

		expect(res.source).toBe('knowledge');
		expect(res.grounded).toBe(true);
		expect(res.answer).toContain('2.500 EUR');
		expect(res.tool).toBeNull();
	});

	it('soru kaydı maskelenmiş yazılır, tenant\'ına bağlıdır ve PII içermez', async () => {
		llm.call = { tool: 'contactBalance', params: { contact_ref: contactB } };
		await mayaService.ask(
			tenantB,
			{ question: 'Kerem Aydın 0555 111 22 33 ne kadar borçlu?' },
			actorB
		);

		const rowsB = await withTenantSession(tenantB, async (tdb) =>
			tdb.execute<{ question_masked: string; tool: string | null; answered: boolean; source: string }>(
				drizzleSql`select question_masked, tool, answered, source from maya_questions where tenant_id = ${tenantB} order by created_at desc limit 1`
			)
		);
		const row = rowsB[0]!;
		expect(row.tool).toBe('contactBalance');
		expect(row.answered).toBe(true);
		expect(row.source).toBe('tool');
		expect(row.question_masked).not.toContain('Kerem');
		expect(row.question_masked).not.toContain('Aydın');
		expect(row.question_masked).not.toContain('0555');
		expect(row.question_masked).toContain('KISI_1');
		expect(row.question_masked).toContain('[TELEFON]');

		// Tenant A o satırı göremez.
		const crossRead = await withTenantSession(tenantA, async (tdb) =>
			tdb.execute<{ n: number }>(
				drizzleSql`select count(*)::int as n from maya_questions where question_masked like '%KISI_1%[TELEFON]%'`
			)
		);
		expect(Number(crossRead[0]!.n)).toBe(0);
	});

	it('izin reddi de soru kaydına düşer — AI-11b hangi rolün neye ihtiyacı olduğunu görsün', async () => {
		llm.call = { tool: 'openBalances', params: {} };
		await mayaService.ask(tenantA, { question: 'Kimlerden alacağımız var?' }, actorA);

		const rows = await withTenantSession(tenantA, async (tdb) =>
			tdb.execute<{ tool: string | null; answered: boolean; source: string }>(
				drizzleSql`select tool, answered, source from maya_questions where tenant_id = ${tenantA} order by created_at desc limit 1`
			)
		);
		expect(rows[0]!.tool).toBe('openBalances');
		expect(rows[0]!.answered).toBe(false);
		expect(rows[0]!.source).toBe('unknown');
	});

	it('her LLM çağrısı llm.parse ledger\'ına satır yazar', async () => {
		const before = await withTenantSession(tenantB, async (tdb) =>
			tdb.execute<{ n: number }>(
				drizzleSql`select count(*)::int as n from jobs where tenant_id = ${tenantB} and job_type = 'llm.parse'`
			)
		);

		llm.call = null;
		llm.knowledgeAnswer = 'Saç ekimi (FUE) — 2.500 EUR.';
		await mayaService.ask(tenantB, { question: 'Saç ekimi fiyatı?' }, actorB);

		const after = await withTenantSession(tenantB, async (tdb) =>
			tdb.execute<{ n: number }>(
				drizzleSql`select count(*)::int as n from jobs where tenant_id = ${tenantB} and job_type = 'llm.parse'`
			)
		);
		// İki çağrı: araç seçici + bilgi bankası cevabı.
		expect(Number(after[0]!.n) - Number(before[0]!.n)).toBe(2);
	});

	it('API anahtarında izin açık scope listesidir — settings:read yetmez', async () => {
		const settingsOnly: MayaActor = { kind: 'api_key', scopes: ['settings:read'] };
		const financeKey: MayaActor = { kind: 'api_key', scopes: ['settings:read', 'finance:read'] };

		expect(await toolsService.isToolAllowed(tenantB, settingsOnly, 'contactBalance')).toBe(false);
		expect(await toolsService.isToolAllowed(tenantB, financeKey, 'contactBalance')).toBe(true);
		expect(await toolsService.isToolAllowed(tenantB, financeKey, 'untouchedContacts')).toBe(false);
	});
});
