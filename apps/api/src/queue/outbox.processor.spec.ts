import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { outboxEvents } from '../db/schema';
import { CryptoService } from '../common/crypto.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { OutboxProcessor } from './outbox.processor';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('OutboxProcessor DLQ (AUDIT-F09-05)', () => {
	const tenantId = randomUUID();
	let processor: OutboxProcessor;
	let tenantContext: TenantContextService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Outbox DLQ', ${`odlq-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Outbox DLQ', ${`odlq-${tenantId.slice(0, 8)}`})
		`;

		const dbService = { client: getDb(databaseUrl).db, sql } as unknown as DbService;
		tenantContext = new TenantContextService(dbService);
		processor = new OutboxProcessor(tenantContext, {
			decrypt: async () => 'secret'
		} as unknown as CryptoService);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`delete from outbox_events where tenant_id = ${tenantId}`;
		});
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		await closeDb();
	});

	async function insertOutbox(status = 'pending', attempts = 0): Promise<string> {
		const id = randomUUID();
		await tenantContext.withTenant(tenantId, async ({ db }) => {
			await db.insert(outboxEvents).values({
				id,
				tenantId,
				eventType: 'contact.created',
				destinationUrl: 'http://127.0.0.1:9/webhook',
				payload: { data: { ok: true } },
				status,
				attempts
			});
		});
		return id;
	}

	it('intermediate delivery failure leaves status=failed (not dead)', async () => {
		const id = await insertOutbox();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: false, status: 503 }) as Response)
		);

		await expect(processor.deliver(id, tenantId)).rejects.toThrow(/HTTP 503/);

		const row = await tenantContext.withTenant(tenantId, async ({ db }) => {
			const [r] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, id)).limit(1);
			return r;
		});

		expect(row?.status).toBe('failed');
		expect(row?.attempts).toBe(1);
		expect(row?.deadLetteredAt).toBeNull();
		expect(row?.lastError).toBe('HTTP 503');
		vi.unstubAllGlobals();
	});

	it('markDead sets status=dead and dead_lettered_at after exhaustion', async () => {
		const id = await insertOutbox('failed', 5);

		await processor.markDead(id, tenantId, 'HTTP 503');

		const row = await tenantContext.withTenant(tenantId, async ({ db }) => {
			const [r] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, id)).limit(1);
			return r;
		});

		expect(row?.status).toBe('dead');
		expect(row?.attempts).toBe(5);
		expect(row?.deadLetteredAt).toBeInstanceOf(Date);
		expect(row?.lastError).toBe('HTTP 503');
	});
});
