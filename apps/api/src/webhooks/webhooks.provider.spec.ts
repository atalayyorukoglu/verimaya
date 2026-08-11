import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { CryptoService } from '../common/crypto.service';
import type { DbService } from '../db/db.service';
import type { QueueService } from '../queue/queue.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { WebhooksController } from './webhooks.controller';
import { providerWebhookSecretEnvKey } from './webhooks.signature';
import {
	formatWebhookSignatureHeader,
	hashWebhookSecret,
	signWebhookPayload
} from './webhooks.identity';
import type { WebhookRequestWithRawBody } from './webhooks.signature';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:***@localhost:5433/verimaya';

const PROVIDER = 'ghl';
const SECRET = 'test-ghl-webhook-secret';
const SECRET_ENV = providerWebhookSecretEnvKey(PROVIDER);

async function withTenantSession<T>(
	tenantId: string,
	fn: (tx: import('postgres').TransactionSql) => Promise<T>
): Promise<T> {
	const { sql } = getDb(databaseUrl);
	return sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
		return fn(tx);
	}) as Promise<T>;
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
	const hex = signWebhookPayload(ts, PROVIDER, opts.tenantId, rawBody, SECRET);
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

async function provisionIdentity(tenantId: string, sql: ReturnType<typeof getDb>['sql']) {
	const crypto = new CryptoService();
	const ciphertext = crypto.encrypt(SECRET);
	const keyHash = hashWebhookSecret(SECRET);
	await sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
		await tx`
			insert into tenant_provider_identities (tenant_id, provider, ciphertext, key_hash, key_version)
			values (${tenantId}, ${PROVIDER}, ${ciphertext}, ${keyHash}, 1)
		`;
	});
}

describe('generic webhook HMAC ingest (Adım 23b + WEBHOOK-01)', () => {
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

		await provisionIdentity(tenantId, sql);

		const tenantContext = new TenantContextService({ client: db, sql } as unknown as DbService);

		enqueueSpy = vi.fn(async () => ({ id: 'bull-ghl-1' }));
		const queue = { enqueueDefaultJob: enqueueSpy } as unknown as QueueService;

		controller = new WebhooksController(
			{ client: db, sql } as unknown as DbService,
			tenantContext,
			queue
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantId]);
		delete process.env[SECRET_ENV];
		await closeDb();
	});

	async function countEvents(externalEventId: string): Promise<number> {
		return withTenantSession(tenantId, async (tx) => {
			const [row] = await tx`
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
		const before = await withTenantSession(tenantId, async (tx) => {
			const [row] = await tx`select count(*)::int as n from jobs where tenant_id = ${tenantId}`;
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

		const after = await withTenantSession(tenantId, async (tx) => {
			const [row] = await tx`select count(*)::int as n from jobs where tenant_id = ${tenantId}`;
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
		await provisionIdentity(otherTenantId, sql);

		try {
			const externalEventId = `evt-cross-${randomUUID()}`;
			const payload = { type: 'contact.created', id: externalEventId };
			enqueueSpy.mockClear();

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

			const bCount = await withTenantSession(otherTenantId, async (tx) => {
				const [row] = await tx`
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
			await purgeTenantFixtures(sql, [otherTenantId]);
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