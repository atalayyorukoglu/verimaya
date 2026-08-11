import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ScorecardAutoFillService } from './auto-fill.service';
import { ScorecardService } from './scorecard.service';

process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('scorecard auto-fill integration (Adım 35)', () => {
	const emptyTenant = randomUUID();
	const richTenant = randomUUID();
	let autoFill: ScorecardAutoFillService;
	let scorecard: ScorecardService;
	let sql: ReturnType<typeof getDb>['sql'];

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql: s } = getDb(databaseUrl);
		sql = s;

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${emptyTenant}, 'Empty', ${`af-e-${emptyTenant.slice(0, 8)}`}, now()),
				(${richTenant}, 'Rich', ${`af-r-${richTenant.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${emptyTenant}, 'Empty', ${`af-e-${emptyTenant.slice(0, 8)}`}),
				(${richTenant}, 'Rich', ${`af-r-${richTenant.slice(0, 8)}`})
		`;

		const dbService = { client: db, sql } as unknown as DbService;
		const tenantContext = new TenantContextService(dbService);
		autoFill = new ScorecardAutoFillService(tenantContext);
		scorecard = new ScorecardService(tenantContext);

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${richTenant}, true)`;
			await tx`
				insert into tenant_credentials (tenant_id, provider, ciphertext, key_version)
				values (${richTenant}, 'meta', decode('00', 'hex'), 1)
			`;
			await tx`
				insert into api_keys (tenant_id, name, key_prefix, key_hash, scopes)
				values (${richTenant}, 'ops', 'vm_test', 'hash-af-rich', ${JSON.stringify(['contact:read', 'finance:read', 'settings:read'])}::jsonb)
			`;
			await tx`
				insert into webhook_subscriptions (tenant_id, url, secret_ciphertext, event_types, active)
				values (${richTenant}, 'https://example.test/hook', 'sec', array['contact.created']::text[], true)
			`;
			await tx`
				insert into jobs (tenant_id, queue, job_type, payload, status, attempts, started_at, completed_at)
				values (
					${richTenant}, 'default', 'llm.parse',
					${JSON.stringify({
						provider: 'openai',
						model: 'gpt-4o-mini',
						path: 'openai_compatible',
						estimated_cost_usd_micros: 42
					})}::jsonb,
					'completed', 0, now(), now()
				)
			`;
			await tx`
				insert into inbound_messages (tenant_id, provider, external_id, payload, status)
				values
					(${richTenant}, 'waha', 'ext-a', '{}'::jsonb, 'approved'),
					(${richTenant}, 'waha', 'ext-b', '{}'::jsonb, 'ignored')
			`;
			const [msg] = await tx`
				select id from inbound_messages where tenant_id = ${richTenant} and external_id = 'ext-a'
			`;
			await tx`
				insert into ai_corrections (tenant_id, inbound_message_id, original_parsed, corrected)
				values (${richTenant}, ${msg!.id}, '[]'::jsonb, '[{"amount":1}]'::jsonb)
			`;
			for (let i = 0; i < 12; i++) {
				await tx`
					insert into audit_logs (tenant_id, actor_display_name, action, entity_type, entity_label)
					values (${richTenant}, ${i < 10 ? 'Founder' : 'Other'}, 'update', 'contact', 'seed')
				`;
			}
			await tx`
				insert into tenant_settings (tenant_id, key, value)
				values (
					${richTenant},
					'whatsapp_ai_disclosure',
					${JSON.stringify({ enabled: true, text: 'AI', updated_by: null, updated_at: null })}::jsonb
				)
			`;
		});
	});

	afterAll(async () => {
		for (const tid of [emptyTenant, richTenant]) {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tid}, true)`;
				await tx`delete from scorecard_answers where tenant_id = ${tid}`;
				await tx`delete from scorecard_assessments where tenant_id = ${tid}`;
				await tx`delete from scorecard_profiles where tenant_id = ${tid}`;
				await tx`delete from ai_corrections where tenant_id = ${tid}`;
				await tx`delete from inbound_messages where tenant_id = ${tid}`;
				await tx`delete from audit_logs where tenant_id = ${tid}`;
				await tx`delete from jobs where tenant_id = ${tid}`;
				await tx`delete from webhook_subscriptions where tenant_id = ${tid}`;
				await tx`delete from api_keys where tenant_id = ${tid}`;
				await tx`delete from tenant_credentials where tenant_id = ${tid}`;
				await tx`delete from tenant_settings where tenant_id = ${tid}`;
			});
		}
		await sql`delete from tenants where id in (${emptyTenant}, ${richTenant})`;
		await sql`delete from organization where id in (${emptyTenant}, ${richTenant})`;
		await closeDb();
	});

	it('writes zero auto answers when tenant has no evidence', async () => {
		await scorecard.createProfile(emptyTenant, {
			band: '1-4',
			setup_s1: false,
			setup_s2: false,
			setup_s3: false
		});
		await scorecard.startAssessment(emptyTenant);

		const suggestions = await autoFill.collectSuggestions(emptyTenant);
		expect(suggestions).toHaveLength(0);

		const result = await autoFill.applyAutoFill(emptyTenant);
		expect(result.written).toHaveLength(0);
		expect(result.skipped_no_evidence.length).toBe(8);
	});

	it('auto-fills at least 8 criteria with evidence links on rich tenant', async () => {
		await scorecard.createProfile(richTenant, {
			band: '5-15',
			setup_s1: true,
			setup_s2: true,
			setup_s3: true
		});
		const started = await scorecard.startAssessment(richTenant);

		const suggestions = await autoFill.collectSuggestions(richTenant);
		expect(suggestions.length).toBeGreaterThanOrEqual(8);
		expect(new Set(suggestions.map((s) => s.criterion_id)).size).toBeGreaterThanOrEqual(8);

		const result = await autoFill.applyAutoFill(richTenant, started.assessment.id);
		expect(result.written.length).toBeGreaterThanOrEqual(8);
		expect(result.written.every((w) => w.evidence_note.startsWith('query='))).toBe(true);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${richTenant}, true)`;
			return tx`
				select criterion_id, source, evidence_note
				from scorecard_answers
				where tenant_id = ${richTenant} and assessment_id = ${started.assessment.id}
			`;
		});
		expect(rows.every((r) => r.source === 'auto')).toBe(true);
		expect(rows.length).toBeGreaterThanOrEqual(8);

		// Isolation: empty tenant still sees no rich evidence
		const emptySuggestions = await autoFill.collectSuggestions(emptyTenant);
		expect(emptySuggestions).toHaveLength(0);
	});

	it('does not overwrite a manual answer', async () => {
		const profile = await scorecard.getActiveProfile(richTenant);
		expect(profile).toBeTruthy();
		const started = await scorecard.startAssessment(richTenant);

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${richTenant}, true)`;
			await tx`
				insert into scorecard_answers (
					tenant_id, assessment_id, criterion_id, score, na_declared, evidence_note, source
				) values (
					${richTenant}, ${started.assessment.id}, '2.4', 4, false, 'human override', 'manual'
				)
				on conflict (assessment_id, criterion_id) do update set
					score = excluded.score,
					evidence_note = excluded.evidence_note,
					source = 'manual'
			`;
		});

		const result = await autoFill.applyAutoFill(richTenant, started.assessment.id);
		expect(result.skipped_manual).toContain('2.4');
		expect(result.written.some((w) => w.criterion_id === '2.4')).toBe(false);

		const row = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${richTenant}, true)`;
			const [r] = await tx`
				select source, evidence_note, score
				from scorecard_answers
				where assessment_id = ${started.assessment.id} and criterion_id = '2.4'
			`;
			return r;
		});
		expect(row?.source).toBe('manual');
		expect(row?.evidence_note).toBe('human override');
		expect(Number(row?.score)).toBe(4);
	});
});
