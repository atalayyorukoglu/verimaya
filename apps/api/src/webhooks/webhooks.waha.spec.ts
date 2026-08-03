import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb } from '../db/client';
import type { QueueService } from '../queue/queue.service';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { WebhooksController } from './webhooks.controller';
import {
	formatWahaSignatureHeader,
	signWahaPayload,
	type WebhookRequestWithRawBody
} from './webhooks.signature';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const WAHA_SECRET = 'test-waha-webhook-secret';

async function withTenantSession<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
	const { sql } = getDb(databaseUrl);
	await sql`select set_config('app.current_tenant_id', ${tenantId}, false)`;
	try {
		return await fn();
	} finally {
		await sql`select set_config('app.current_tenant_id', '', false)`;
	}
}

function buildWahaRequest(opts: {
	tenantId: string;
	payload: Record<string, unknown>;
	externalEventId?: string;
	signatureOverride?: string;
	timestampOverride?: number;
	nowForSign?: number;
}): WebhookRequestWithRawBody {
	const rawBody = JSON.stringify(opts.payload);
	const ts = opts.timestampOverride ?? opts.nowForSign ?? Math.floor(Date.now() / 1000);
	const hex = signWahaPayload(rawBody, WAHA_SECRET, ts);
	const headers: Record<string, string> = {
		'x-tenant-id': opts.tenantId,
		'x-webhook-timestamp': String(ts),
		'x-webhook-signature':
			opts.signatureOverride ?? formatWahaSignatureHeader(hex)
	};
	if (opts.externalEventId) {
		headers['x-external-event-id'] = opts.externalEventId;
	}
	return {
		headers,
		body: opts.payload,
		rawBody
	} as WebhookRequestWithRawBody;
}

describe('WAHA webhook HMAC ingest (Adım 22)', () => {
	const tenantId = randomUUID();
	let controller: WebhooksController;
	let enqueueSpy: ReturnType<typeof vi.fn>;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		process.env.WAHA_WEBHOOK_SECRET = WAHA_SECRET;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'WAHA Test', ${`waha-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'WAHA Test', ${`waha-${tenantId.slice(0, 8)}`})
		`;

		const tenantContext = {
			withTenant: async <T>(
				tid: string,
				fn: (ctx: { db: typeof db }) => Promise<T>
			) => withTenantSession(tid, () => fn({ db }))
		} as TenantContextService;

		enqueueSpy = vi.fn(async () => ({ id: 'bull-test-1' }));
		const queue = { enqueueDefaultJob: enqueueSpy } as unknown as QueueService;

		const config = {
			get: (key: string) => process.env[key]
		} as ConfigService;

		controller = new WebhooksController(config, tenantContext, queue);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`delete from jobs where tenant_id = ${tenantId}`;
			await tx`delete from inbound_messages where tenant_id = ${tenantId}`;
		});
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		await closeDb();
	});

	async function countInbound(externalId: string): Promise<number> {
		const { sql } = getDb(databaseUrl);
		return withTenantSession(tenantId, async () => {
			const [row] = await sql`
				select count(*)::int as n
				from inbound_messages
				where tenant_id = ${tenantId}
					and provider = 'waha'
					and external_id = ${externalId}
			`;
			return Number(row?.n ?? 0);
		});
	}

	it('valid signature → accepted + 1 inbound row', async () => {
		const externalId = `evt-valid-${randomUUID()}`;
		enqueueSpy.mockClear();
		const req = buildWahaRequest({
			tenantId,
			externalEventId: externalId,
			payload: {
				event: 'message',
				payload: { id: externalId, body: 'Sandra 100 GBP', from: '1@g.us' }
			}
		});

		const res = await controller.ingestWaha(req);
		expect(res.accepted).toBe(true);
		expect(res.duplicate).toBe(false);
		expect(await countInbound(externalId)).toBe(1);
		expect(enqueueSpy).toHaveBeenCalledTimes(1);
	});

	it('invalid signature → 401 and 0 rows', async () => {
		const externalId = `evt-bad-${randomUUID()}`;
		enqueueSpy.mockClear();
		const beforeJobs = await withTenantSession(tenantId, async () => {
			const { sql } = getDb(databaseUrl);
			const [row] = await sql`select count(*)::int as n from jobs where tenant_id = ${tenantId}`;
			return Number(row?.n ?? 0);
		});

		const req = buildWahaRequest({
			tenantId,
			externalEventId: externalId,
			signatureOverride: formatWahaSignatureHeader('00'.repeat(32)),
			payload: {
				event: 'message',
				payload: { id: externalId, body: 'should not land' }
			}
		});

		await expect(controller.ingestWaha(req)).rejects.toBeInstanceOf(UnauthorizedException);
		expect(await countInbound(externalId)).toBe(0);
		expect(enqueueSpy).not.toHaveBeenCalled();

		const afterJobs = await withTenantSession(tenantId, async () => {
			const { sql } = getDb(databaseUrl);
			const [row] = await sql`select count(*)::int as n from jobs where tenant_id = ${tenantId}`;
			return Number(row?.n ?? 0);
		});
		expect(afterJobs).toBe(beforeJobs);
	});

	it('same event twice → accepted both times but only 1 row', async () => {
		const externalId = `evt-dup-${randomUUID()}`;
		enqueueSpy.mockClear();
		const payload = {
			event: 'message',
			payload: { id: externalId, body: 'dup body' }
		};

		const first = await controller.ingestWaha(
			buildWahaRequest({ tenantId, externalEventId: externalId, payload })
		);
		const second = await controller.ingestWaha(
			buildWahaRequest({ tenantId, externalEventId: externalId, payload })
		);

		expect(first.duplicate).toBe(false);
		expect(second.accepted).toBe(true);
		expect(second.duplicate).toBe(true);
		expect(second.inbound_message_id).toBe(first.inbound_message_id);
		expect(await countInbound(externalId)).toBe(1);
		expect(enqueueSpy).toHaveBeenCalledTimes(1);
	});

	it('EVENT-01 (4.2): concurrent duplicate deliveries race safely — no 500, only 1 row', async () => {
		const externalId = `evt-race-${randomUUID()}`;
		enqueueSpy.mockClear();
		const payload = {
			event: 'message',
			payload: { id: externalId, body: 'race body' }
		};

		const [a, b] = await Promise.all([
			controller.ingestWaha(buildWahaRequest({ tenantId, externalEventId: externalId, payload })),
			controller.ingestWaha(buildWahaRequest({ tenantId, externalEventId: externalId, payload }))
		]);

		expect(a.accepted).toBe(true);
		expect(b.accepted).toBe(true);
		expect(a.inbound_message_id).toBe(b.inbound_message_id);
		expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
		expect(await countInbound(externalId)).toBe(1);
		expect(enqueueSpy).toHaveBeenCalledTimes(1);
	});
});
