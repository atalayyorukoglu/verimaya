import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { CryptoService } from '../common/crypto.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import type { QueueService } from '../queue/queue.service';
import { WebhookSubscriptionsService } from './webhook-subscriptions.service';

process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

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

describe('webhook_subscriptions tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let subscriptionA: string;
	let subscriptionB: string;
	let service: WebhookSubscriptionsService;

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

		service = new WebhookSubscriptionsService(
			tenantContext,
			new CryptoService(),
			{} as QueueService
		);

		subscriptionA = await withTenantSession(tenantA, async () => {
			const created = await service.createWithDb(db, tenantA, {
				url: 'https://tenant-a.example.com/hooks/verimaya',
				secret: 'tenant-a-super-secret-value',
				event_types: ['transaction.created']
			});
			return created.id;
		});

		subscriptionB = await withTenantSession(tenantB, async () => {
			const created = await service.createWithDb(db, tenantB, {
				url: 'https://tenant-b.example.com/hooks/verimaya',
				secret: 'tenant-b-super-secret-value',
				event_types: ['transaction.created', 'contact.created']
			});
			return created.id;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantA, async () => {
			await sql`delete from webhook_subscriptions where tenant_id = ${tenantA}`;
		});
		await withTenantSession(tenantB, async () => {
			await sql`delete from webhook_subscriptions where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A lists only its own webhook subscription', async () => {
		const result = await service.list(tenantA);
		expect(result.items.map((s) => s.id)).toEqual([subscriptionA]);
		expect(result.items.some((s) => s.id === subscriptionB)).toBe(false);
		expect(result.items[0]?.url).toBe('https://tenant-a.example.com/hooks/verimaya');
	});

	it('Tenant B lists only its own webhook subscription', async () => {
		const result = await service.list(tenantB);
		expect(result.items.map((s) => s.id)).toEqual([subscriptionB]);
		expect(result.items.some((s) => s.id === subscriptionA)).toBe(false);
	});

	it('Tenant A cannot delete Tenant B webhook subscription', async () => {
		const { db } = getDb(databaseUrl);
		await withTenantSession(tenantA, async () => {
			await expect(service.removeWithDb(db, tenantA, subscriptionB)).rejects.toBeInstanceOf(
				NotFoundException
			);
		});

		const stillThere = await service.list(tenantB);
		expect(stillThere.items.map((s) => s.id)).toContain(subscriptionB);
	});

	it('does not leak the plaintext secret in list results', async () => {
		const result = await service.list(tenantA);
		expect(JSON.stringify(result)).not.toContain('tenant-a-super-secret-value');
	});
});
