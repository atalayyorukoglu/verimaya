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
	formatWebhookSignatureHeader,
	hashWebhookSecret,
	signWebhookPayload
} from './webhooks.identity';
import type { WebhookRequestWithRawBody } from './webhooks.signature';

/**
 * WEBHOOK-01 (Faz 8) — negative isolation tests for cross-tenant webhook spoof.
 *
 * Threat model (Opus denetimi §[CRITICAL] WEBHOOK-01): an attacker holding the
 * WAHA_WEBHOOK_SECRET (or any per-provider shared secret) could send a valid signature
 * with `X-Tenant-Id: <other-tenant>` and write into that tenant. The fix binds tenant id
 * into the signed payload AND resolves the canonical tenant from `tenant_provider_identities`
 * rather than the header. These tests prove the fix by trying every spoof variant
 * documented in the audit and asserting 401 — never a write.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:***@localhost:5433/verimaya';

const PROVIDER = 'waha';

function buildSigned(opts: {
	tenantId: string;
	secret: string;
	provider?: string;
	payload?: Record<string, unknown>;
}): WebhookRequestWithRawBody {
	const payload = opts.payload ?? { event: 'message', payload: { id: randomUUID(), body: 'x' } };
	const rawBody = JSON.stringify(payload);
	const ts = Math.floor(Date.now() / 1000);
	const provider = opts.provider ?? PROVIDER;
	const hex = signWebhookPayload(ts, provider, opts.tenantId, rawBody, opts.secret);
	const fake = {
		headers: {
			'x-tenant-id': opts.tenantId,
			'x-webhook-timestamp': String(ts),
			'x-webhook-signature': formatWebhookSignatureHeader(hex)
		},
		body: payload,
		rawBody
	};
	return fake as unknown as WebhookRequestWithRawBody;
}

describe('WEBHOOK-01 cross-tenant isolation (Opus denetimi §[CRITICAL])', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const secretA = 'secret-for-tenant-a-only';
	const secretB = 'secret-for-tenant-b-only';
	let controller: WebhooksController;
	let enqueueSpy: ReturnType<typeof vi.fn>;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);
		const crypto = new CryptoService();

		for (const [tenantId, secret] of [
			[tenantA, secretA],
			[tenantB, secretB]
		] as Array<[string, string]>) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, 'WEBHOOK-01 Test', ${`webhook-01-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug)
				values (${tenantId}, 'WEBHOOK-01 Test', ${`webhook-01-${tenantId.slice(0, 8)}`})
			`;
			const ciphertext = crypto.encrypt(secret);
			const keyHash = hashWebhookSecret(secret);
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
				await tx`
					insert into tenant_provider_identities (tenant_id, provider, ciphertext, key_hash, key_version)
					values (${tenantId}, ${PROVIDER}, ${ciphertext}, ${keyHash}, 1)
				`;
			});
		}

		const tenantContext = new TenantContextService({ client: db, sql } as unknown as DbService);
		enqueueSpy = vi.fn(async () => ({ id: 'bull-iso' }));
		const queue = { enqueueDefaultJob: enqueueSpy } as unknown as QueueService;
		controller = new WebhooksController(
			{ client: db, sql } as unknown as DbService,
			tenantContext,
			queue
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		for (const tenantId of [tenantA, tenantB]) {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
				await tx`delete from jobs where tenant_id = ${tenantId}`;
				await tx`delete from inbound_messages where tenant_id = ${tenantId}`;
				await tx`delete from tenant_provider_identities where tenant_id = ${tenantId}`;
			});
			await sql`delete from tenants where id = ${tenantId}`;
			await sql`delete from organization where id = ${tenantId}`;
		}
		await closeDb();
	});

	it('attacker holding secretA signs payload claiming tenantA → tenantA receives (legit)', async () => {
		enqueueSpy.mockClear();
		const req = buildSigned({ tenantId: tenantA, secret: secretA });
		const res = await controller.ingestWaha(req);
		expect(res.accepted).toBe(true);
		expect(res.duplicate).toBe(false);
		expect(enqueueSpy).toHaveBeenCalledTimes(1);
	});

	it('attacker holding secretA signs payload claiming tenantB → rejected 401 (CROSS-TENANT SPOOF)', async () => {
		enqueueSpy.mockClear();
		// Attacker has A's secret, but writes X-Tenant-Id: B to inject into tenant B.
		// The signature is over `${ts}.${provider}.${tenantA}.${body}` (because the attacker
		// used A as the claimed tenant when signing — that's the only secret they have).
		// The resolver looks up identities for (provider, tenant B) → finds only B's row,
		// tries B's secret → signature mismatch → 401.
		const req = buildSigned({
			tenantId: tenantB,
			secret: secretA,
			payload: { event: 'message', payload: { id: randomUUID(), body: 'spoof' } }
		});
		await expect(controller.ingestWaha(req)).rejects.toBeInstanceOf(UnauthorizedException);
		expect(enqueueSpy).not.toHaveBeenCalled();
	});

	it('attacker with NO secret tries tenantA → rejected 401', async () => {
		enqueueSpy.mockClear();
		const req = buildSigned({ tenantId: tenantA, secret: 'no-such-secret' });
		await expect(controller.ingestWaha(req)).rejects.toBeInstanceOf(UnauthorizedException);
		expect(enqueueSpy).not.toHaveBeenCalled();
	});

	it('attacker rewrites X-Tenant-Id header AFTER signing for tenantA → rejected 401', async () => {
		enqueueSpy.mockClear();
		// Sign with A's secret, A as claimed tenant. Then change only the header
		// to B. Signature is now over A (because that was what the attacker
		// knew), but the resolver tries to find an identity for B (because that's
		// what the header now claims). B's row has a different secret → no match.
		const ts = Math.floor(Date.now() / 1000);
		const payload = { event: 'message', payload: { id: randomUUID(), body: 'rewritten' } };
		const rawBody = JSON.stringify(payload);
		const hex = signWebhookPayload(ts, PROVIDER, tenantA, rawBody, secretA);
		const req: WebhookRequestWithRawBody = {
			headers: {
				'x-tenant-id': tenantB,
				'x-webhook-timestamp': String(ts),
				'x-webhook-signature': formatWebhookSignatureHeader(hex)
			},
			body: payload,
			rawBody
		} as unknown as WebhookRequestWithRawBody;
		await expect(controller.ingestWaha(req)).rejects.toBeInstanceOf(UnauthorizedException);
		expect(enqueueSpy).not.toHaveBeenCalled();
	});

	it('attacker rewrites provider segment of signed payload but keeps A secret → rejected 401', async () => {
		enqueueSpy.mockClear();
		// Sign with A's secret claiming tenantA. Attacker flips provider to "ghl" in the
		// signature computation but keeps the same secret bytes. Now the resolver tries
		// identity(ghl, tenantA) which has no row → 401.
		const req = buildSigned({ tenantId: tenantA, secret: secretA, provider: 'ghl' });
		await expect(controller.ingestWaha(req)).rejects.toBeInstanceOf(UnauthorizedException);
		expect(enqueueSpy).not.toHaveBeenCalled();
	});

	it('replay: same signed payload twice (within window) → 1 row, 1 enqueue (idempotent dedup, not a write vulnerability)', async () => {
		enqueueSpy.mockClear();
		const req = buildSigned({ tenantId: tenantA, secret: secretA });
		const first = await controller.ingestWaha(req);
		const second = await controller.ingestWaha(req);
		expect(first.accepted).toBe(true);
		expect(first.duplicate).toBe(false);
		expect(second.duplicate).toBe(true);
		expect(second.inbound_message_id).toBe(first.inbound_message_id);
		expect(enqueueSpy).toHaveBeenCalledTimes(1);
	});
});