import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { sql as drizzleSql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aiCorrectionsReportParamsSchema } from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import { parseQuery } from '../common/mappers';
import type { TenantContextService, TenantDb } from '../tenant/tenant-context.service';
import { AiCorrectionsService } from './ai-corrections.service';
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

const draft = {
	kind: 'income' as const,
	amount: 290000,
	currency: 'GBP' as const,
	title: '2. vizit ödemesi',
	category: null,
	subcategory: null,
	contact_id: null,
	contact_display_name: null,
	contact_label: null,
	occurred_on: '2026-01-15',
	payment_method: null,
	description: null
};

describe('ai_corrections tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let correctionA: string;
	let correctionB: string;
	let service: AiCorrectionsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`})
		`;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>) =>
				withTenantSession(id, () => fn({ tx: sql, db }))
		} as TenantContextService;

		service = new AiCorrectionsService(tenantContext);

		const createdA = await service.create(
			tenantA,
			{ inbound_message_id: null, original_parsed: [draft], corrected: [{ ...draft, amount: 300000 }] },
			'user-a'
		);
		correctionA = createdA.id;

		const createdB = await service.create(
			tenantB,
			{ inbound_message_id: null, original_parsed: [draft], corrected: [{ ...draft, category: 'Vizit' }] },
			'user-b'
		);
		correctionB = createdB.id;
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant A lists only its own correction', async () => {
		const result = await service.list(tenantA, { limit: 25 });
		expect(result.items.map((c) => c.id)).toEqual([correctionA]);
		expect(result.items.some((c) => c.id === correctionB)).toBe(false);
		expect(result.items[0]?.corrected[0]?.amount).toBe(300000);
	});

	it('Tenant B lists only its own correction', async () => {
		const result = await service.list(tenantB, { limit: 25 });
		expect(result.items.map((c) => c.id)).toEqual([correctionB]);
		expect(result.items.some((c) => c.id === correctionA)).toBe(false);
	});

	it('Tenant A cannot see Tenant B correction via RLS', async () => {
		const { sql } = getDb(databaseUrl);
		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select id from ai_corrections where id = ${correctionB}`;
		});
		expect(rows).toHaveLength(0);
	});
});

describe('GAP-F09-15: ai_corrections report aggregation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let msgA: string;
	let msgB: string;
	let service: AiCorrectionsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Report A', ${`rep-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Report B', ${`rep-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Report A', ${`rep-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Report B', ${`rep-b-${tenantB.slice(0, 8)}`})
		`;

		msgA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into inbound_messages (tenant_id, provider, external_id, payload, status)
				values (
					${tenantA},
					'waha',
					${`rep-a-${tenantA.slice(0, 8)}`},
					${JSON.stringify({ body: 'report msg A' })}::jsonb,
					'parsed'
				)
				returning id
			`;
			return row!.id as string;
		});
		msgB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into inbound_messages (tenant_id, provider, external_id, payload, status)
				values (
					${tenantA},
					'waha',
					${`rep-b-${tenantA.slice(0, 8)}`},
					${JSON.stringify({ body: 'report msg B' })}::jsonb,
					'parsed'
				)
				returning id
			`;
			return row!.id as string;
		});

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>) =>
				withTenantSession(id, () => fn({ tx: sql, db }))
		} as TenantContextService;
		service = new AiCorrectionsService(tenantContext);

		const original = JSON.stringify([draft]);
		const amountAndCategory = JSON.stringify([
			{ ...draft, amount: 300000, category: 'Vizit' }
		]);
		const categoryOnly = JSON.stringify([{ ...draft, category: 'Transfer' }]);
		const categoryVizit = JSON.stringify([{ ...draft, category: 'Vizit' }]);
		const kindExpense = JSON.stringify([{ ...draft, kind: 'expense' }]);

		await withTenantSession(tenantA, async () => {
			await sql`
				insert into ai_corrections (
					tenant_id, inbound_message_id, original_parsed, corrected, created_at
				) values
					(
						${tenantA}, ${msgA}, ${original}::jsonb, ${amountAndCategory}::jsonb,
						'2026-02-10T12:00:00+00'::timestamptz
					),
					(
						${tenantA}, ${msgA}, ${original}::jsonb, ${categoryOnly}::jsonb,
						'2026-02-15T12:00:00+00'::timestamptz
					),
					(
						${tenantA}, ${msgB}, ${original}::jsonb, ${categoryVizit}::jsonb,
						'2026-03-01T12:00:00+00'::timestamptz
					)
			`;
		});

		await withTenantSession(tenantB, async () => {
			await sql`
				insert into ai_corrections (
					tenant_id, inbound_message_id, original_parsed, corrected, created_at
				) values (
					${tenantB}, ${null}, ${original}::jsonb, ${kindExpense}::jsonb,
					'2026-02-20T12:00:00+00'::timestamptz
				)
			`;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('aggregates field counts with repeats across 2+ fields', async () => {
		const report = await service.report(tenantA, {});
		expect(report.period).toEqual({ from: null, to: null });
		// msgA (2 correction rows) + msgB (1 row) = 2 distinct corrected messages.
		expect(report.corrected_message_count).toBe(2);
		expect(report.items).toEqual([
			{
				field: 'category',
				correction_count: 3,
				distinct_messages: 2,
				by_confidence: [{ confidence: null, correction_count: 3, distinct_messages: 2 }]
			},
			{
				field: 'amount',
				correction_count: 1,
				distinct_messages: 1,
				by_confidence: [{ confidence: null, correction_count: 1, distinct_messages: 1 }]
			}
		]);
	});

	it('narrows by from/to inclusive calendar days on created_at', async () => {
		const febOnly = await service.report(tenantA, { from: '2026-02-01', to: '2026-02-28' });
		expect(febOnly.period).toEqual({ from: '2026-02-01', to: '2026-02-28' });
		expect(febOnly.corrected_message_count).toBe(1);
		expect(febOnly.items).toEqual([
			{
				field: 'category',
				correction_count: 2,
				distinct_messages: 1,
				by_confidence: [{ confidence: null, correction_count: 2, distinct_messages: 1 }]
			},
			{
				field: 'amount',
				correction_count: 1,
				distinct_messages: 1,
				by_confidence: [{ confidence: null, correction_count: 1, distinct_messages: 1 }]
			}
		]);

		const marchOnly = await service.report(tenantA, { from: '2026-03-01', to: '2026-03-01' });
		expect(marchOnly.corrected_message_count).toBe(1);
		expect(marchOnly.items).toEqual([
			{
				field: 'category',
				correction_count: 1,
				distinct_messages: 1,
				by_confidence: [{ confidence: null, correction_count: 1, distinct_messages: 1 }]
			}
		]);
	});

	it('does not include Tenant B corrections in Tenant A report', async () => {
		const reportA = await service.report(tenantA, {});
		expect(reportA.items.some((r) => r.field === 'kind')).toBe(false);

		const reportB = await service.report(tenantB, {});
		expect(reportB.corrected_message_count).toBe(1);
		expect(reportB.items).toEqual([
			{
				field: 'kind',
				correction_count: 1,
				distinct_messages: 1,
				by_confidence: [{ confidence: null, correction_count: 1, distinct_messages: 1 }]
			}
		]);
	});

	it('rejects undefined query params with 400 (parseQuery + .strict)', () => {
		const req = { id: 'test-request-id' } as Parameters<typeof parseQuery>[2];
		expect(() =>
			parseQuery(aiCorrectionsReportParamsSchema, { not_a_real_filter: '1' }, req)
		).toThrow(BadRequestException);
	});
});

describe('AI-03: field × AI-09 confidence breakdown', () => {
	const tenantA = randomUUID();
	let service: AiCorrectionsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantA}, 'Confidence A', ${`conf-a-${tenantA.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantA}, 'Confidence A', ${`conf-a-${tenantA.slice(0, 8)}`})
		`;

		// AI-09 taslağı: category=high, amount=low iz taşıyor. Aynı sıradaki
		// original_parsed/corrected ile eşleşsin diye tek elemanlı dizi.
		const parsedRecordWithEvidence = {
			...draft,
			evidence: {
				category: { quote: 'vizit kategorisi', start: null, confidence: 'high' },
				amount: { quote: '2900 GBP', start: null, confidence: 'low' }
			}
		};

		const msg = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into inbound_messages (tenant_id, provider, external_id, payload, status)
				values (
					${tenantA},
					'waha',
					${`conf-a-${tenantA.slice(0, 8)}`},
					${JSON.stringify({ body: 'confidence msg', parsed_records: [parsedRecordWithEvidence] })}::jsonb,
					'parsed'
				)
				returning id
			`;
			return row!.id as string;
		});

		const original = JSON.stringify([draft]);
		// category (high) AND amount (low) both corrected; currency untouched (no evidence anyway).
		const corrected = JSON.stringify([{ ...draft, amount: 300000, category: 'Vizit' }]);

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`
				insert into ai_corrections (tenant_id, inbound_message_id, original_parsed, corrected)
				values (${tenantA}, ${msg}, ${original}::jsonb, ${corrected}::jsonb)
			`;
		});

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				db.transaction(async (tx) => {
					await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${id}, true)`);
					return fn({ db: tx as TenantDb });
				})
		} as TenantContextService;
		service = new AiCorrectionsService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA]);
		await closeDb();
	});

	it('attributes the pre-correction AI-09 confidence to each corrected field', async () => {
		const report = await service.report(tenantA, {});
		expect(report.corrected_message_count).toBe(1);

		const category = report.items.find((r) => r.field === 'category');
		expect(category?.by_confidence).toEqual([
			{ confidence: 'high', correction_count: 1, distinct_messages: 1 }
		]);

		const amount = report.items.find((r) => r.field === 'amount');
		expect(amount?.by_confidence).toEqual([
			{ confidence: 'low', correction_count: 1, distinct_messages: 1 }
		]);
	});
});
