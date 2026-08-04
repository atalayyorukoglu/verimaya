import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { CryptoService } from '../common/crypto.service';
import type { DbService } from '../db/db.service';
import type { QueueService } from '../queue/queue.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { WebhooksController } from './webhooks.controller';
import {
	buildSignedPayload,
	formatWebhookSignatureHeader,
	hashWebhookSecret,
	signWebhookPayload
} from './webhooks.identity';
import type { WebhookRequestWithRawBody } from './webhooks.signature';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:***@localhost:5433/verimaya';

/**
 * WAHA-01 (Faz 8): the spec signs with the new per-tenant payload format
 * (`${ts}.${provider}.${claimedTenantId}.${body}`) and a per-tenant secret. The spec
 * provisions a `tenant_provider_identities` row for the test tenant and signs with
 * that row's plaintext secret. WEBHOOK-01 negative isolation tests live in
 * `webhooks.identity.isolation.spec.ts` (cross-tenant header spoof attempt).
 */
const WAHA_PROVIDER = 'waha';
const WAHA_SECRET = 'test-waha-webhook-secret';

function buildWahaRequest(opts: {
	tenantId: string;
	payload: Record<string, unknown>;
	externalEventId?: string;
	signatureOverride?: string;
	timestampOverride?: number;
	nowForSign?: number;
	secret?: string;
}): WebhookRequestWithRawBody {
	const rawBody = JSON.stringify(opts.payload);
	const ts = opts.timestampOverride ?? opts.nowForSign ?? Math.floor(Date.now() / 1000);
	const secret = opts.secret ?? WAHA_SECRET;
	const hex = signWebhookPayload(ts, WAHA_PROVIDER, opts.tenantId, rawBody, secret);
	const headers: Record<string, string> = {
		'x-tenant-id': opts.tenantId,
		'x-webhook-timestamp': String(ts),
		'x-webhook-signature':
			opts.signatureOverride ?? formatWebhookSignatureHeader(hex)
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

describe('WAHA webhook HMAC ingest (Adım 22 + WEBHOOK-01)', () => {
	const tenantId = randomUUID();
	let controller: WebhooksController;
	let enqueueSpy: ReturnType<typeof vi.fn>;
	let crypto: CryptoService;
	const plaintextSecret = WAHA_SECRET;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'WAHA Test', ${`waha-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'WAHA Test', ${`waha-${tenantId.slice(0, 8)}`})
		`;

		// Provision per-tenant provider identity for WAHA. WEBHOOK-01 closes the cross-tenant
		// header-trust gap; the signature now binds claimed tenant id + provider + body.
		crypto = new CryptoService();
		const ciphertext = crypto.encrypt(plaintextSecret);
		const keyHash = (await import('./webhooks.identity')).hashWebhookSecret(plaintextSecret);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`
				insert into tenant_provider_identities (tenant_id, provider, ciphertext, key_hash, key_version)
				values (${tenantId}, ${WAHA_PROVIDER}, ${ciphertext}, ${keyHash}, 1)
			`;
		});

		// F-02: elle yazılmış sahte withTenant yerine üretimdeki servisin kendisi —
		// gerçek transaction + `SET LOCAL app.current_tenant_id`, dolayısıyla eşzamanlı
		// senaryolar üretimle aynı izolasyon altında koşuyor.
		const tenantContext = new TenantContextService({ client: db, sql } as unknown as DbService);

		enqueueSpy = vi.fn(async () => ({ id: 'bull-test-1' }));
		const queue = { enqueueDefaultJob: enqueueSpy } as unknown as QueueService;

		controller = new WebhooksController(
			{ client: db, sql } as unknown as DbService,
			tenantContext,
			queue
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`delete from jobs where tenant_id = ${tenantId}`;
			await tx`delete from inbound_messages where tenant_id = ${tenantId}`;
			await tx`delete from tenant_provider_identities where tenant_id = ${tenantId}`;
		});
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		await closeDb();
	});

	async function countInbound(externalId: string): Promise<number> {
		const { sql } = getDb(databaseUrl);
		return sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`
				select count(*)::int as n
				from inbound_messages
				where tenant_id = ${tenantId}
					and provider = 'waha'
					and external_id = ${externalId}
			`;
			return Number(row?.n ?? 0);
		}) as Promise<number>;
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
		const { sql } = getDb(databaseUrl);
		const beforeJobs = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`select count(*)::int as n from jobs where tenant_id = ${tenantId}`;
			return Number(row?.n ?? 0);
		}) as number;

		const req = buildWahaRequest({
			tenantId,
			externalEventId: externalId,
			signatureOverride: formatWebhookSignatureHeader('00'.repeat(32)),
			payload: {
				event: 'message',
				payload: { id: externalId, body: 'should not land' }
			}
		});

		await expect(controller.ingestWaha(req)).rejects.toBeInstanceOf(UnauthorizedException);
		expect(await countInbound(externalId)).toBe(0);
		expect(enqueueSpy).not.toHaveBeenCalled();

		const afterJobs = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`select count(*)::int as n from jobs where tenant_id = ${tenantId}`;
			return Number(row?.n ?? 0);
		}) as number;
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

/**
 * Export for use by the cross-tenant isolation spec. Keeping the helper inline here so
 * the two spec files don't drift in their signing logic.
 */
export { buildWahaRequest as __buildWahaRequest, buildSignedPayload as __buildSignedPayload };