/**
 * AI-09 — `transactions.source_inbound_message_id` + `source_evidence`.
 *
 * Kanıtlanan üç cümle:
 *  1. Onay akışı izi **sunucudaki taslaktan** yazar (istek gövdesinden değil).
 *  2. İz API isteğiyle **yazılamaz** — ne create'te ne update'te.
 *  3. İz tenant sınırını geçmez.
 *
 * Gerçek Postgres gerektirir (RLS). Tenant bağlamı YALNIZ drizzle transaction +
 * `set_config(..., true)` ile kurulur; session-level ayar yok.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import {
	transactionCreateSchema,
	transactionUpdateSchema,
	approveDraftItemSchema,
	type ApproveDraftsRequest,
	type TransactionDraft
} from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import { IdempotencyService } from '../common/idempotency.service';
import { DbService } from '../db/db.service';
import { HeuristicLlmClient } from '../integrations/llm';
import { ContactsService } from '../contacts/contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { TransactionsService } from './transactions.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const testActor = { actorId: null, actorDisplayName: 'AI-09 Source Evidence Test' };

const MESSAGE = 'Sandra Lab için 2900 GBP ödendi';

/** Parse yolunun ürettiğine denk, elle kurulmuş taslak — testi LLM'den bağımsız tutar. */
function storedDraft(overrides: Partial<TransactionDraft> = {}): TransactionDraft {
	return {
		kind: 'expense',
		amount: 290_000,
		currency: 'GBP',
		title: 'Sandra Lab',
		category: 'Pazarlama',
		subcategory: null,
		contact_id: null,
		contact_display_name: null,
		contact_label: 'Sandra Lab',
		occurred_on: '2026-08-01',
		payment_method: null,
		description: MESSAGE,
		evidence: {
			amount: { quote: '2900', start: MESSAGE.indexOf('2900'), confidence: 'high' },
			currency: { quote: 'GBP', start: MESSAGE.indexOf('GBP'), confidence: 'high' },
			kind: { quote: 'ödendi', start: MESSAGE.indexOf('ödendi'), confidence: 'medium' },
			occurred_on: { quote: '', start: null, confidence: 'low' }
		},
		...overrides
	};
}

function approveItem(
	overrides: Partial<ApproveDraftsRequest['drafts'][number]> = {}
): ApproveDraftsRequest['drafts'][number] {
	return {
		kind: 'expense',
		amount: 290_000,
		currency: 'GBP',
		title: 'Sandra Lab',
		category: 'Pazarlama',
		subcategory: null,
		contact_id: null,
		contact_display_name: null,
		contact_label: 'Sandra Lab',
		occurred_on: '2026-08-01',
		payment_method: null,
		description: MESSAGE,
		counterparty_amount: null,
		status: 'paid',
		paid_amount: 290_000,
		fx_rate: 1,
		amount_base: 290_000,
		...overrides
	};
}

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

describe('AI-09 kaynak izi — kalıcılık, sunucu sınırı, izolasyon', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let whatsappService: WhatsappService;
	let transactionsService: TransactionsService;
	let idempotency: IdempotencyService;

	async function seedInbox(tenantId: string, drafts: TransactionDraft[]): Promise<string> {
		const { sql } = getDb(databaseUrl);
		return sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`
				insert into inbound_messages (tenant_id, provider, external_id, payload, status)
				values (
					${tenantId},
					'waha',
					${`ai09-${randomUUID().slice(0, 12)}`},
					${JSON.stringify({ body: MESSAGE, parsed_records: drafts, parse_error: null })}::jsonb,
					'parsed'
				)
				returning id
			`;
			return row!.id as string;
		});
	}

	async function approve(
		tenantId: string,
		inboxId: string,
		input: ApproveDraftsRequest
	) {
		return idempotency.run(
			tenantId,
			`ai09-${randomUUID()}`,
			'POST',
			'/v1/whatsapp/inbox/:id/approve-drafts',
			async (db) => ({
				statusCode: 201,
				body: await whatsappService.approveDraftsWithDb(db, tenantId, inboxId, input, testActor)
			})
		);
	}

	async function readRow(tenantId: string, transactionId: string) {
		const { sql } = getDb(databaseUrl);
		return sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`
				select source_inbound_message_id, source_evidence
				from transactions where id = ${transactionId}
			`;
			return row ?? null;
		});
	}

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		for (const [id, label] of [
			[tenantA, 'AI09 A'],
			[tenantB, 'AI09 B']
		] as const) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${id}, ${label}, ${`ai09-${id.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug, base_currency)
				values (${id}, ${label}, ${`ai09-${id.slice(0, 8)}`}, 'TRY')
			`;
		}

		const dbService = { client: db, sql } as unknown as DbService;
		const tenantContext = new TenantContextService(dbService);
		idempotency = new IdempotencyService(tenantContext);
		transactionsService = new TransactionsService(tenantContext);
		whatsappService = new WhatsappService(
			new ContactsService(tenantContext, new LocalFileStorage()),
			tenantContext,
			transactionsService,
			{
				getAiPrompt: async () => ({
					text: '',
					is_default: true,
					updated_by: null,
					updated_at: null
				})
			} as never,
			new HeuristicLlmClient()
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('onay, izi sunucudaki taslaktan işleme yazar', async () => {
		const inboxId = await seedInbox(tenantA, [storedDraft()]);
		const result = await approve(tenantA, inboxId, { drafts: [approveItem()] });

		const created = result.body.transactions[0]!;
		expect(created.source_inbound_message_id).toBe(inboxId);
		expect(created.source_evidence?.amount).toEqual({
			quote: '2900',
			start: MESSAGE.indexOf('2900'),
			confidence: 'high'
		});
		expect(created.source_evidence?.occurred_on?.confidence).toBe('low');

		const row = await readRow(tenantA, created.id);
		expect(row?.source_inbound_message_id).toBe(inboxId);
		expect((row?.source_evidence as Record<string, unknown>).currency).toBeDefined();
	});

	it('kullanıcı bir alanı düzelttiyse O ALANIN izi düşer, diğerleri kalır', async () => {
		const inboxId = await seedInbox(tenantA, [storedDraft()]);
		// AI 2900 GBP demişti; insan 3100 yaptı → "2900" artık tutarın kaynağı değil.
		const result = await approve(tenantA, inboxId, {
			drafts: [approveItem({ amount: 310_000, paid_amount: 310_000, amount_base: 310_000 })]
		});

		const created = result.body.transactions[0]!;
		expect(created.amount).toBe(310_000);
		expect(created.source_evidence?.amount).toBeUndefined();
		expect(created.source_evidence?.currency?.quote).toBe('GBP');
	});

	it('istek gövdesindeki uydurma evidence yok sayılır — sunucudaki iz yazılır', async () => {
		const inboxId = await seedInbox(tenantA, [storedDraft()]);
		const forged = {
			...approveItem(),
			evidence: {
				amount: { quote: 'banka dekontunda yazıyor', start: 0, confidence: 'high' }
			}
		};
		// approveDraftItemSchema'da `evidence` yok — zod sessizce düşürür.
		const parsed = approveDraftItemSchema.parse(forged);
		expect('evidence' in parsed).toBe(false);

		const result = await approve(tenantA, inboxId, {
			drafts: [parsed as ApproveDraftsRequest['drafts'][number]]
		});
		const evidence = result.body.transactions[0]!.source_evidence;
		expect(evidence?.amount?.quote).toBe('2900');
	});

	it('taslak sayısı tutmuyorsa iz yazılmaz, kaynak mesaj bağı yine kalır', async () => {
		const inboxId = await seedInbox(tenantA, [storedDraft(), storedDraft()]);
		const result = await approve(tenantA, inboxId, { drafts: [approveItem()] });
		const created = result.body.transactions[0]!;
		expect(created.source_inbound_message_id).toBe(inboxId);
		expect(created.source_evidence).toBeNull();
	});

	it('izsiz ESKİ taslak onayı bozmaz', async () => {
		const draft = storedDraft();
		delete draft.evidence;
		const inboxId = await seedInbox(tenantA, [draft]);
		const result = await approve(tenantA, inboxId, { drafts: [approveItem()] });
		expect(result.body.transactions[0]!.source_evidence).toBeNull();
		expect(result.body.transactions[0]!.amount).toBe(290_000);
	});

	describe('sunucu sınırı — iz API isteğinden yazılamaz', () => {
		it('transactionCreateSchema iki alanı da tanımaz (zod düşürür)', () => {
			const parsed = transactionCreateSchema.parse({
				kind: 'expense',
				title: 'Elle girilen',
				subtitle: null,
				category: null,
				occurred_on: '2026-08-01',
				status: 'paid',
				invoice_status: 'none',
				payment_method: null,
				amount: 1000,
				paid_amount: 1000,
				currency: 'TRY',
				contact_label: null,
				description: null,
				source_inbound_message_id: randomUUID(),
				source_evidence: {
					amount: { quote: 'uydurma', start: 0, confidence: 'high' }
				}
			});
			expect('source_evidence' in parsed).toBe(false);
			expect('source_inbound_message_id' in parsed).toBe(false);
		});

		it('transactionUpdateSchema de tanımaz', () => {
			const parsed = transactionUpdateSchema.parse({
				amount: 2000,
				source_evidence: { amount: { quote: 'uydurma', start: 0, confidence: 'high' } }
			});
			expect('source_evidence' in parsed).toBe(false);
		});

		it('POST gövdesiyle gelen iz DB\'ye ulaşmaz — kolonlar null kalır', async () => {
			const body = {
				kind: 'expense',
				title: 'Elle girilen',
				subtitle: null,
				category: null,
				occurred_on: '2026-08-01',
				status: 'paid',
				invoice_status: 'none',
				payment_method: null,
				amount: 1000,
				paid_amount: 1000,
				currency: 'TRY',
				contact_label: null,
				description: null,
				source_inbound_message_id: randomUUID(),
				source_evidence: {
					amount: { quote: 'uydurma', start: 0, confidence: 'high' }
				}
			};
			// Controller'ın yaptığı tek şey: parseBody → createWithDb(input, actor).
			// `source` argümanı geçilmiyor; iz yazacak başka yol yok.
			const input = transactionCreateSchema.parse(body);
			const created = await withTenantSession(tenantA, (tdb) =>
				transactionsService.createWithDb(tdb, tenantA, input, testActor)
			);

			expect(created.source_inbound_message_id).toBeNull();
			expect(created.source_evidence).toBeNull();

			const row = await readRow(tenantA, created.id);
			expect(row?.source_inbound_message_id).toBeNull();
			expect(row?.source_evidence).toBeNull();
		});

		it('update izi silmez ve değiştirmez', async () => {
			const inboxId = await seedInbox(tenantA, [storedDraft()]);
			const result = await approve(tenantA, inboxId, { drafts: [approveItem()] });
			const created = result.body.transactions[0]!;

			await withTenantSession(tenantA, (tdb) =>
				transactionsService.updateWithDb(
					tdb,
					tenantA,
					created.id,
					transactionUpdateSchema.parse({
						title: 'Elle düzeltildi',
						source_evidence: {
							amount: { quote: 'uydurma', start: 0, confidence: 'high' }
						}
					}),
					testActor
				)
			);

			const row = await readRow(tenantA, created.id);
			expect(row?.source_inbound_message_id).toBe(inboxId);
			expect((row?.source_evidence as Record<string, { quote: string }>).amount?.quote).toBe(
				'2900'
			);
		});
	});

	it('tenant izolasyonu — B, A\'nın izini göremez', async () => {
		const inboxA = await seedInbox(tenantA, [storedDraft()]);
		const resultA = await approve(tenantA, inboxA, { drafts: [approveItem()] });
		const txA = resultA.body.transactions[0]!;

		const { sql } = getDb(databaseUrl);
		const seenByB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`
				select id, source_evidence from transactions where id = ${txA.id}
			`;
		});
		expect(seenByB).toHaveLength(0);

		const leaked = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`
				select count(*)::int as n from transactions
				where source_inbound_message_id = ${inboxA}
			`;
		});
		expect((leaked[0]! as { n: number }).n).toBe(0);
	});

	it("B'nin onayı A'nın gelen kutusuna erişemez", async () => {
		const inboxA = await seedInbox(tenantA, [storedDraft()]);
		await expect(approve(tenantB, inboxA, { drafts: [approveItem()] })).rejects.toThrow(
			/not found/i
		);
	});
});
