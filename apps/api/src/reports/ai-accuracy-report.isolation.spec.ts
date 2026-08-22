import { randomUUID } from 'node:crypto';
import { sql as drizzleSql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';
import { AiAccuracyReportService } from './ai-accuracy-report.service';

/**
 * AI-03 — isabet ölçümü. Üç kaynağı (`ai_corrections`, `record_update_suggestions`,
 * `maya_questions`) birleştiren rapor. Negatif izolasyon + her alt bölümün doğru
 * hesaplandığı + dönem filtresinin `created_at`'i daralttığı test edilir.
 */
const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(
	tenantId: string,
	fn: (tdb: TenantDb) => Promise<T>
): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
		return fn(tx as TenantDb);
	});
}

describe('AI-03: ai-accuracy report', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let service: AiAccuracyReportService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		service = new AiAccuracyReportService(
			new TenantContextService({ client: db, sql } as unknown as never)
		);

		for (const [tenantId, name] of [
			[tenantA, 'AI-03 A'],
			[tenantB, 'AI-03 B']
		] as Array<[string, string]>) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, ${name}, ${`ai03-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug)
				values (${tenantId}, ${name}, ${`ai03-${tenantId.slice(0, 8)}`})
			`;
		}

		const draft = {
			kind: 'income' as const,
			amount: 100000,
			currency: 'TRY' as const,
			title: 'vizit',
			category: null,
			subcategory: null,
			contact_id: null,
			contact_display_name: null,
			contact_label: null,
			occurred_on: '2026-02-10',
			payment_method: null,
			description: null
		};

		// ---- Tenant A: draft accuracy (2 approved, 1 corrected → unchanged_rate 0.5) ----
		await withTenantSession(tenantA, async (tdb) => {
			const [correctedMsg] = await tdb.execute(drizzleSql`
				insert into inbound_messages (tenant_id, provider, external_id, payload, status)
				values (${tenantA}, 'waha', 'ai03-a-corrected', ${JSON.stringify({ body: 'msg1' })}::jsonb, 'approved')
				returning id
			`);
			const [uncorrectedMsg] = await tdb.execute(drizzleSql`
				insert into inbound_messages (tenant_id, provider, external_id, payload, status)
				values (${tenantA}, 'waha', 'ai03-a-uncorrected', ${JSON.stringify({ body: 'msg2' })}::jsonb, 'approved')
				returning id
			`);
			const correctedMsgId = (correctedMsg as { id: string }).id;
			const uncorrectedMsgId = (uncorrectedMsg as { id: string }).id;

			await tdb.execute(drizzleSql`
				insert into transactions (tenant_id, kind, occurred_on, status, amount, currency, source_inbound_message_id, created_at, updated_at)
				values
					(${tenantA}, 'income', '2026-02-10', 'paid', 100000, 'TRY', ${correctedMsgId}, '2026-02-10T10:00:00Z', '2026-02-10T10:00:00Z'),
					(${tenantA}, 'income', '2026-02-11', 'paid', 200000, 'TRY', ${uncorrectedMsgId}, '2026-02-11T10:00:00Z', '2026-02-11T10:00:00Z')
			`);

			await tdb.execute(drizzleSql`
				insert into ai_corrections (tenant_id, inbound_message_id, original_parsed, corrected, created_at)
				values (
					${tenantA}, ${correctedMsgId},
					${JSON.stringify([draft])}::jsonb,
					${JSON.stringify([{ ...draft, amount: 150000 }])}::jsonb,
					'2026-02-10T10:00:00Z'
				)
			`);

			// ---- suggestions: approved / rejected(with reason) / pending ----
			await tdb.execute(drizzleSql`
				insert into contact_types (tenant_id, name) values (${tenantA}, 'Hasta') on conflict do nothing
			`);
			const [contact] = await tdb.execute(drizzleSql`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name, first_name, display_name, status, created_at, updated_at
				) values (
					${tenantA},
					(select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1),
					'Hasta', 'AI-03 Patient', 'AI-03 Patient', 'scheduled', now(), now()
				)
				returning id
			`);
			const contactId = (contact as { id: string }).id;

			const apptRows = await tdb.execute(drizzleSql`
				insert into appointments (tenant_id, contact_id, contact_display_name, title, status, starts_at, created_at, updated_at)
				values
					(${tenantA}, ${contactId}, 'AI-03 Patient', 'v1', 'scheduled', '2026-02-10T09:00:00Z', now(), now()),
					(${tenantA}, ${contactId}, 'AI-03 Patient', 'v2', 'scheduled', '2026-02-11T09:00:00Z', now(), now()),
					(${tenantA}, ${contactId}, 'AI-03 Patient', 'v3', 'scheduled', '2026-02-12T09:00:00Z', now(), now())
				returning id
			`);
			const [appt1, appt2, appt3] = [...apptRows].map((r) => (r as { id: string }).id);

			await tdb.execute(drizzleSql`
				insert into record_update_suggestions (
					tenant_id, appointment_id, field, current_value, suggested_value,
					source_text, confidence, status, reject_reason, created_at, updated_at
				) values
					(
						${tenantA}, ${appt1}, 'starts_at', '2026-02-10T09:00:00Z', '2026-02-10T11:00:00Z',
						'saat 11 olsun', 'high', 'approved', null, '2026-02-10T10:00:00Z', now()
					),
					(
						${tenantA}, ${appt2}, 'starts_at', '2026-02-11T09:00:00Z', '2026-02-11T11:00:00Z',
						'belki 11', 'medium', 'rejected', 'Yanlış saat', '2026-02-11T10:00:00Z', now()
					),
					(
						${tenantA}, ${appt3}, 'starts_at', '2026-02-12T09:00:00Z', '2026-02-12T11:00:00Z',
						'belki 11', 'medium', 'pending', null, '2026-02-12T10:00:00Z', now()
					)
			`);

			// ---- maya_questions: 2 answered, 1 unanswered ----
			await tdb.execute(drizzleSql`
				insert into maya_questions (tenant_id, question_masked, tool, answered, source, created_at)
				values
					(${tenantA}, 'Saç ekimi fiyatı nedir?', null, true, 'knowledge', '2026-02-10T10:00:00Z'),
					(${tenantA}, 'KISI_1 bakiyesi ne kadar?', 'contactBalance', true, 'tool', '2026-02-11T10:00:00Z'),
					(${tenantA}, 'Yarın hava nasıl olur?', null, false, 'unknown', '2026-02-12T10:00:00Z')
			`);

			// Out-of-period row (March) — period-filter test must exclude this.
			await tdb.execute(drizzleSql`
				insert into maya_questions (tenant_id, question_masked, tool, answered, source, created_at)
				values (${tenantA}, 'Mart sorusu', null, false, 'unknown', '2026-03-05T10:00:00Z')
			`);
		});

		// ---- Tenant B: distinct small fixture, must not leak into A's report ----
		await withTenantSession(tenantB, async (tdb) => {
			await tdb.execute(drizzleSql`
				insert into maya_questions (tenant_id, question_masked, tool, answered, source, created_at)
				values (${tenantB}, 'Tenant B sorusu', null, false, 'unknown', '2026-02-15T10:00:00Z')
			`);
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('computes draft accuracy: approved/corrected counts + unchanged_rate + by_field', async () => {
		const report = await service.get(tenantA, {});
		expect(report.drafts.approved_message_count).toBe(2);
		expect(report.drafts.corrected_message_count).toBe(1);
		expect(report.drafts.unchanged_rate).toBe(0.5);
		const amountRow = report.drafts.by_field.find((r) => r.field === 'amount');
		expect(amountRow?.correction_count).toBe(1);
	});

	it('computes suggestion acceptance rate + reject reasons, excludes pending from the rate', async () => {
		const report = await service.get(tenantA, {});
		expect(report.suggestions.total).toBe(3);
		expect(report.suggestions.approved).toBe(1);
		expect(report.suggestions.rejected).toBe(1);
		expect(report.suggestions.pending).toBe(1);
		expect(report.suggestions.acceptance_rate).toBe(0.5);
		expect(report.suggestions.reject_reasons).toEqual([{ reason: 'Yanlış saat', count: 1 }]);
	});

	it('computes Maya answer rate + unanswered sample for the "add to knowledge base" pointer', async () => {
		const report = await service.get(tenantA, { from: '2026-02-01', to: '2026-02-28' });
		expect(report.maya.total).toBe(3);
		expect(report.maya.answered).toBe(2);
		expect(report.maya.unanswered).toBe(1);
		expect(report.maya.answer_rate).toBeCloseTo(2 / 3);
		expect(report.maya.unanswered_samples.map((s) => s.question_masked)).toEqual([
			'Yarın hava nasıl olur?'
		]);
		const bySource = Object.fromEntries(report.maya.by_source.map((s) => [s.source, s.count]));
		expect(bySource).toEqual({ knowledge: 1, tool: 1, unknown: 1 });
	});

	it('narrows by from/to — March question excluded, Tenant B question excluded', async () => {
		const febOnly = await service.get(tenantA, { from: '2026-02-01', to: '2026-02-28' });
		expect(febOnly.maya.total).toBe(3);

		const allTime = await service.get(tenantA, {});
		expect(allTime.maya.total).toBe(4);
	});

	it('Tenant A report does not include Tenant B data', async () => {
		const reportA = await service.get(tenantA, {});
		const reportB = await service.get(tenantB, {});

		expect(reportA.maya.unanswered_samples.some((s) => s.question_masked === 'Tenant B sorusu')).toBe(
			false
		);
		expect(reportB.maya.total).toBe(1);
		expect(reportB.suggestions.total).toBe(0);
		expect(reportB.drafts.approved_message_count).toBe(0);
	});
});
