import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb } from '../db/client';
import type { QueueService } from '../queue/queue.service';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { WebhooksController } from './webhooks.controller';
import {
	formatWebhookSignatureHeader,
	providerWebhookSecretEnvKey,
	signWebhookPayload,
	type WebhookRequestWithRawBody
} from './webhooks.signature';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const PROVIDER = 'ghl';
const SECRET = 'test-ghl-webhook-secret';
const SECRET_ENV = providerWebhookSecretEnvKey(PROVIDER);

async function withTenantSession<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
	const { sql } = getDb(databaseUrl);
	await sql`select set_config('app.current_tenant_id', ${tenantId}, false)`;
	try {
		return await fn();
	} finally {
		await sql`select set_config('app.current_tenant_id', '', false)`;
	}
}

function buildRequest(opts: {
	tenantId: string;
	payload: Record<string, unknown>;
	externalEventId?: string;
	signatureOverride?: string;
	timestampOverride?: number;
}): WebhookRequestWithRawBody {
	const rawBody = JSON.stringify(opts.payload);
	const ts = opts.timestampOverride ?? Math.floor(Date.now() / 1000);
	const hex = signWebhookPayload(rawBody, SECRET, ts);
	const headers: Record<string, string> = {
		'x-tenant-id': opts.tenantId,
		'x-webhook-timestamp': String(ts),
		'x-webhook-signature': opts.signatureOverride ?? formatWebhookSignatureHeader(hex)
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

describe('generic webhook HMAC ingest (Adım 23b)', () => {
	const tenantId = randomUUID();
	let controller: WebhooksController;
	let enqueueSpy: ReturnType<typeof vi.fn>;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		process.env[SECRET_ENV] = SECRET;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'GHL HMAC Test', ${`ghl-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'GHL HMAC Test', ${`ghl-${tenantId.slice(0, 8)}`})
		`;

		const tenantContext = {
			withTenant: async <T>(
				tid: string,
				fn: (ctx: { db: typeof db }) => Promise<T>
			) => withTenantSession(tid, () => fn({ db }))
		} as TenantContextService;

		enqueueSpy = vi.fn(async () => ({ id: 'bull-ghl-1' }));
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
			await tx`delete from integration_events where tenant_id = ${tenantId}`;
		});
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		delete process.env[SECRET_ENV];
		await closeDb();
	});

	async function countEvents(externalEventId: string): Promise<number> {
		const { sql } = getDb(databaseUrl);
		return withTenantSession(tenantId, async () => {
			const [row] = await sql`
				select count(*)::int as n
				from integration_events
				where tenant_id = ${tenantId}
					and provider = ${PROVIDER}
					and external_event_id = ${externalEventId}
			`;
			return Number(row?.n ?? 0);
		});
	}

	it('valid signature → accepted + 1 integration_events row', async () => {
		const externalEventId = `evt-valid-${randomUUID()}`;
		enqueueSpy.mockClear();
		const res = await controller.ingest(
			PROVIDER,
			buildRequest({
				tenantId,
				externalEventId,
				payload: { type: 'contact.created', id: externalEventId }
			})
		);
		expect(res.accepted).toBe(true);
		expect(res.duplicate).toBe(false);
		expect(await countEvents(externalEventId)).toBe(1);
		expect(enqueueSpy).toHaveBeenCalledTimes(1);
	});

	it('invalid signature → 401 and 0 rows', async () => {
		const externalEventId = `evt-bad-${randomUUID()}`;
		enqueueSpy.mockClear();
		const before = await withTenantSession(tenantId, async () => {
			const { sql } = getDb(databaseUrl);
			const [row] =
				await sql`select count(*)::int as n from jobs where tenant_id = ${tenantId}`;
			return Number(row?.n ?? 0);
		});

		await expect(
			controller.ingest(
				PROVIDER,
				buildRequest({
					tenantId,
					externalEventId,
					signatureOverride: formatWebhookSignatureHeader('00'.repeat(32)),
					payload: { type: 'contact.created', id: externalEventId }
				})
			)
		).rejects.toBeInstanceOf(UnauthorizedException);

		expect(await countEvents(externalEventId)).toBe(0);
		expect(enqueueSpy).not.toHaveBeenCalled();

		const after = await withTenantSession(tenantId, async () => {
			const { sql } = getDb(databaseUrl);
			const [row] =
				await sql`select count(*)::int as n from jobs where tenant_id = ${tenantId}`;
			return Number(row?.n ?? 0);
		});
		expect(after).toBe(before);
	});

	it('same event twice → accepted both times but only 1 row', async () => {
		const externalEventId = `evt-dup-${randomUUID()}`;
		enqueueSpy.mockClear();
		const payload = { type: 'contact.created', id: externalEventId };

		const first = await controller.ingest(
			PROVIDER,
			buildRequest({ tenantId, externalEventId, payload })
		);
		const second = await controller.ingest(
			PROVIDER,
			buildRequest({ tenantId, externalEventId, payload })
		);

		expect(first.duplicate).toBe(false);
		expect(second.accepted).toBe(true);
		expect(second.duplicate).toBe(true);
		expect(second.integration_event_id).toBe(first.integration_event_id);
		expect(await countEvents(externalEventId)).toBe(1);
		expect(enqueueSpy).toHaveBeenCalledTimes(1);
	});

	it('EVENT-01 (4.2): cross-tenant same external_event_id — two independent rows, no 500', async () => {
		const otherTenantId = randomUUID();
		const { sql } = getDb(databaseUrl);
		await sql`
			insert into organization (id, name, slug, created_at)
			values (${otherTenantId}, 'GHL HMAC Test B', ${`ghl-b-${otherTenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${otherTenantId}, 'GHL HMAC Test B', ${`ghl-b-${otherTenantId.slice(0, 8)}`})
		`;

		try {
			const externalEventId = `evt-cross-${randomUUID()}`;
			const payload = { type: 'contact.created', id: externalEventId };
			enqueueSpy.mockClear();

			// Before EVENT-01: the second call's SELECT (RLS-scoped to otherTenantId) never sees
			// tenant A's row, so it proceeds to INSERT and collides with the old *global*
			// (provider, external_event_id) unique index -> uncaught 23505 -> 500.
			const a = await controller.ingest(
				PROVIDER,
				buildRequest({ tenantId, externalEventId, payload })
			);
			const b = await controller.ingest(
				PROVIDER,
				buildRequest({ tenantId: otherTenantId, externalEventId, payload })
			);

			expect(a.accepted).toBe(true);
			expect(a.duplicate).toBe(false);
			expect(b.accepted).toBe(true);
			expect(b.duplicate).toBe(false); // NOT a duplicate — different tenant
			expect(a.integration_event_id).not.toBe(b.integration_event_id);
			expect(await countEvents(externalEventId)).toBe(1);

			const bCount = await withTenantSession(otherTenantId, async () => {
				const [row] = await sql`
					select count(*)::int as n
					from integration_events
					where tenant_id = ${otherTenantId}
						and provider = ${PROVIDER}
						and external_event_id = ${externalEventId}
				`;
				return Number(row?.n ?? 0);
			});
			expect(bCount).toBe(1);
			expect(enqueueSpy).toHaveBeenCalledTimes(2);
		} finally {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${otherTenantId}, true)`;
				await tx`delete from jobs where tenant_id = ${otherTenantId}`;
				await tx`delete from integration_events where tenant_id = ${otherTenantId}`;
			});
			await sql`delete from tenants where id = ${otherTenantId}`;
			await sql`delete from organization where id = ${otherTenantId}`;
		}
	});

	it('EVENT-01 (4.2): concurrent duplicate deliveries (same tenant) race safely — no 500, only 1 row', async () => {
		const externalEventId = `evt-race-${randomUUID()}`;
		const payload = { type: 'contact.created', id: externalEventId };
		enqueueSpy.mockClear();

		const [a, b] = await Promise.all([
			controller.ingest(PROVIDER, buildRequest({ tenantId, externalEventId, payload })),
			controller.ingest(PROVIDER, buildRequest({ tenantId, externalEventId, payload }))
		]);

		expect(a.accepted).toBe(true);
		expect(b.accepted).toBe(true);
		expect(a.integration_event_id).toBe(b.integration_event_id);
		expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
		expect(await countEvents(externalEventId)).toBe(1);
		expect(enqueueSpy).toHaveBeenCalledTimes(1);
	});
});

describe('providerWebhookSecretEnvKey', () => {
	it('maps provider slug to WEBHOOK_SECRET_*', () => {
		expect(providerWebhookSecretEnvKey('ghl')).toBe('WEBHOOK_SECRET_GHL');
		expect(providerWebhookSecretEnvKey('meta-ads')).toBe('WEBHOOK_SECRET_META_ADS');
	});
});
