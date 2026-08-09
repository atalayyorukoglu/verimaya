import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { outboxEvents } from '../db/schema';
import { TenantContextService } from '../tenant/tenant-context.service';
import { OutboxAdminService } from './outbox-admin.service';
import type { QueueService } from './queue.service';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('OutboxAdminService requeue (AUDIT-F09-05)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let admin: OutboxAdminService;
	let tenantContext: TenantContextService;
	const enqueueCalls: Array<{ jobId: string; tenantId: string }> = [];

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		for (const [id, label] of [
			[tenantA, 'oa'],
			[tenantB, 'ob']
		] as const) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${id}, ${`OutboxAdmin ${label}`}, ${`${label}-${id.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug)
				values (${id}, ${`OutboxAdmin ${label}`}, ${`${label}-${id.slice(0, 8)}`})
			`;
		}

		const dbService = { client: db, sql } as unknown as DbService;
		tenantContext = new TenantContextService(dbService);

		const queueStub = {
			getDefaultQueue: () => ({
				getJob: async () => null
			}),
			enqueueDefaultJob: async (
				_type: string,
				data: { jobId: string; tenantId: string }
			) => {
				enqueueCalls.push({ jobId: data.jobId, tenantId: data.tenantId });
				return {};
			}
		} as unknown as QueueService;

		admin = new OutboxAdminService(dbService, tenantContext, queueStub);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		for (const id of [tenantA, tenantB]) {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${id}, true)`;
				await tx`delete from outbox_events where tenant_id = ${id}`;
			});
			await sql`delete from tenants where id = ${id}`;
			await sql`delete from organization where id = ${id}`;
		}
		await closeDb();
	});

	async function insertRow(
		tenantId: string,
		status: string,
		attempts: number
	): Promise<string> {
		const id = randomUUID();
		await tenantContext.withTenant(tenantId, async ({ db }) => {
			await db.insert(outboxEvents).values({
				id,
				tenantId,
				eventType: 'patient.created',
				destinationUrl: 'https://example.test/hook',
				payload: {},
				status,
				attempts,
				deadLetteredAt: status === 'dead' ? new Date() : null,
				lastError: status === 'dead' ? 'exhausted' : null
			});
		});
		return id;
	}

	it('requeues dead → pending, preserves attempts, ignores pending/sent', async () => {
		enqueueCalls.length = 0;
		const deadId = await insertRow(tenantA, 'dead', 7);
		const pendingId = await insertRow(tenantA, 'pending', 0);
		const sentId = await insertRow(tenantA, 'sent', 1);

		const result = await admin.requeue({ tenant_id: tenantA, ids: [deadId, pendingId, sentId] });

		expect(result.requeued).toBe(1);
		expect(result.ids).toEqual([deadId]);

		const rows = await tenantContext.withTenant(tenantA, async ({ db }) => {
			const list = await db.select().from(outboxEvents).where(eq(outboxEvents.tenantId, tenantA));
			return Object.fromEntries(list.map((r) => [r.id, r]));
		});

		expect(rows[deadId]?.status).toBe('pending');
		expect(rows[deadId]?.attempts).toBe(7);
		expect(rows[deadId]?.deadLetteredAt).toBeNull();
		expect(rows[pendingId]?.status).toBe('pending');
		expect(rows[sentId]?.status).toBe('sent');
		expect(enqueueCalls).toEqual([{ jobId: deadId, tenantId: tenantA }]);
	});

	it('tenant A requeue does not affect tenant B dead rows', async () => {
		enqueueCalls.length = 0;
		const deadA = await insertRow(tenantA, 'dead', 3);
		const deadB = await insertRow(tenantB, 'dead', 4);

		const result = await admin.requeue({ tenant_id: tenantA });

		expect(result.ids).toContain(deadA);
		expect(result.ids).not.toContain(deadB);

		const rowB = await tenantContext.withTenant(tenantB, async ({ db }) => {
			const [r] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, deadB)).limit(1);
			return r;
		});
		expect(rowB?.status).toBe('dead');
		expect(rowB?.attempts).toBe(4);
		expect(enqueueCalls.every((c) => c.tenantId === tenantA)).toBe(true);
	});

	it('leaves the row dead when the enqueue fails (never silently pending-with-no-job)', async () => {
		const deadId = await insertRow(tenantA, 'dead', 9);
		const failingQueue = {
			getDefaultQueue: () => ({ getJob: async () => null }),
			enqueueDefaultJob: async () => {
				throw new Error('Missing lock for job — still active');
			}
		} as unknown as QueueService;
		const failingAdmin = new OutboxAdminService(
			{ client: getDb(databaseUrl).db, sql: getDb(databaseUrl).sql } as unknown as DbService,
			tenantContext,
			failingQueue
		);

		const result = await failingAdmin.requeue({ tenant_id: tenantA, ids: [deadId] });

		expect(result.requeued).toBe(0);
		expect(result.ids).toEqual([]);

		const row = await tenantContext.withTenant(tenantA, async ({ db }) => {
			const [r] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, deadId)).limit(1);
			return r;
		});
		expect(row?.status).toBe('dead');
		expect(row?.attempts).toBe(9);
		expect(row?.deadLetteredAt).not.toBeNull();
	});

	it('listDead returns only dead rows for the scoped tenant', async () => {
		const dead = await insertRow(tenantA, 'dead', 2);
		await insertRow(tenantA, 'failed', 1);

		const { items } = await admin.listDead(50, tenantA);
		expect(items.every((i) => i.status === 'dead')).toBe(true);
		expect(items.some((i) => i.id === dead)).toBe(true);
		expect(items.every((i) => i.tenant_id === tenantA)).toBe(true);
	});
});
