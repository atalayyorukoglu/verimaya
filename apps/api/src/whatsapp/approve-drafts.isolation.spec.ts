/**
 * MONEY-01: POST /v1/whatsapp/inbox/:id/approve-drafts
 * — atomic insert + correction + status; idempotent replay; rollback on mid-flight failure.
 *
 * Requires real Postgres (RLS + transactions). Same harness as inbox.isolation.spec.ts.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApproveDraftsRequest } from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import { IdempotencyService } from '../common/idempotency.service';
import { DbService } from '../db/db.service';
import { HeuristicLlmClient } from '../integrations/llm';
import { PatientsService } from '../patients/patients.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TransactionsService } from '../transactions/transactions.service';
import { WhatsappService } from './whatsapp.service';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

function draftPayload(overrides: Partial<ApproveDraftsRequest['drafts'][number]> = {}) {
	return {
		kind: 'income' as const,
		amount: 10_000,
		currency: 'TRY' as const,
		title: 'MONEY-01 test',
		occurred_on: '2026-08-01',
		status: 'paid' as const,
		paid_amount: 10_000,
		fx_rate: 1,
		amount_base: 10_000,
		contact_label: 'Test Contact',
		patient_id: null,
		contact_id: null,
		category: null,
		subcategory: null,
		patient_display_name: null,
		payment_method: null,
		description: null,
		counterparty_amount: null,
		...overrides
	};
}

describe('approve-drafts atomicity + idempotency (MONEY-01)', () => {
	const tenantId = randomUUID();
	let whatsappService: WhatsappService;
	let idempotency: IdempotencyService;
	let tenantContext: TenantContextService;
	let inboxId: string;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Money01', ${`m01-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug, base_currency)
			values (${tenantId}, 'Money01', ${`m01-${tenantId.slice(0, 8)}`}, 'TRY')
		`;

		inboxId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`
				insert into inbound_messages (tenant_id, provider, external_id, payload, status)
				values (
					${tenantId},
					'waha',
					${`ext-${tenantId.slice(0, 8)}`},
					${JSON.stringify({ body: 'Sandra 100 TRY odeme' })}::jsonb,
					'parsed'
				)
				returning id
			`;
			return row!.id as string;
		});

		const dbService = { client: db, sql } as unknown as DbService;
		tenantContext = new TenantContextService(dbService);
		idempotency = new IdempotencyService(tenantContext);
		whatsappService = new WhatsappService(
			new PatientsService(tenantContext, new LocalFileStorage()),
			tenantContext,
			new TransactionsService(tenantContext),
			new HeuristicLlmClient()
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`delete from ai_corrections where tenant_id = ${tenantId}`;
			await tx`delete from transactions where tenant_id = ${tenantId}`;
			await tx`delete from idempotency_keys where tenant_id = ${tenantId}`;
			await tx`delete from inbound_messages where tenant_id = ${tenantId}`;
		});
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		await closeDb();
	});

	it('same Idempotency-Key twice yields one transaction set', async () => {
		const key = `money01-${randomUUID()}`;
		const input: ApproveDraftsRequest = {
			drafts: [draftPayload()],
			original_parsed: [
				{
					kind: 'income',
					amount: 10_000,
					currency: 'TRY',
					title: 'AI original',
					occurred_on: '2026-08-01'
				}
			]
		};

		const first = await idempotency.run(
			tenantId,
			key,
			'POST',
			`/v1/whatsapp/inbox/${inboxId}/approve-drafts`,
			async (db) => ({
				statusCode: 201,
				body: await whatsappService.approveDraftsWithDb(db, tenantId, inboxId, input, null)
			})
		);
		expect(first.replayed).toBe(false);
		expect(first.body.transactions).toHaveLength(1);
		expect(first.body.status).toBe('approved');
		expect(first.body.correction_id).not.toBeNull();

		const second = await idempotency.run(
			tenantId,
			key,
			'POST',
			`/v1/whatsapp/inbox/${inboxId}/approve-drafts`,
			async (db) => ({
				statusCode: 201,
				body: await whatsappService.approveDraftsWithDb(db, tenantId, inboxId, input, null)
			})
		);
		expect(second.replayed).toBe(true);
		expect(second.body.transactions).toHaveLength(1);
		expect(second.body.transactions[0]!.id).toBe(first.body.transactions[0]!.id);

		const { sql } = getDb(databaseUrl);
		const count = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`
				select count(*)::int as n from transactions where tenant_id = ${tenantId}
			`;
			return row!.n as number;
		});
		expect(count).toBe(1);
	});

	it('mid-flight failure rolls back — no transactions, inbox stays parsed', async () => {
		const { sql } = getDb(databaseUrl);
		const freshInbox = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`
				insert into inbound_messages (tenant_id, provider, external_id, payload, status)
				values (
					${tenantId},
					'waha',
					${`ext-rb-${randomUUID().slice(0, 8)}`},
					${JSON.stringify({ body: 'rollback test' })}::jsonb,
					'parsed'
				)
				returning id
			`;
			return row!.id as string;
		});

		const beforeCount = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`
				select count(*)::int as n from transactions where tenant_id = ${tenantId}
			`;
			return row!.n as number;
		});

		const badPatientId = randomUUID();
		await expect(
			idempotency.run(
				tenantId,
				`money01-rb-${randomUUID()}`,
				'POST',
				`/v1/whatsapp/inbox/${freshInbox}/approve-drafts`,
				async (db) => ({
					statusCode: 201,
					body: await whatsappService.approveDraftsWithDb(
						db,
						tenantId,
						freshInbox,
						{
							drafts: [
								draftPayload({ patient_id: badPatientId }),
								draftPayload({ title: 'second should not exist' })
							]
						},
						null
					)
				})
			)
		).rejects.toThrow();

		const after = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [countRow] = await tx`
				select count(*)::int as n from transactions where tenant_id = ${tenantId}
			`;
			const [msg] = await tx`
				select status from inbound_messages where id = ${freshInbox}
			`;
			return { count: countRow!.n as number, status: msg!.status as string };
		});

		expect(after.count).toBe(beforeCount);
		expect(after.status).toBe('parsed');
	});
});
