import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { PatientsService } from '../patients/patients.service';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { WhatsappService } from './whatsapp.service';

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

describe('inbound_messages RLS isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let messageA: string;
	let messageB: string;
	let whatsappService: WhatsappService;

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

		messageA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into inbound_messages (tenant_id, provider, external_id, payload, status)
				values (
					${tenantA},
					'waha',
					${`ext-a-${tenantA.slice(0, 8)}`},
					${JSON.stringify({ body: 'Tenant A message' })}::jsonb,
					'new'
				)
				returning id
			`;
			return row!.id as string;
		});

		messageB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into inbound_messages (tenant_id, provider, external_id, payload, status)
				values (
					${tenantB},
					'waha',
					${`ext-b-${tenantB.slice(0, 8)}`},
					${JSON.stringify({ body: 'Tenant B message' })}::jsonb,
					'new'
				)
				returning id
			`;
			return row!.id as string;
		});

		const tenantContext = {
			withTenant: async <T>(
				tenantId: string,
				fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>
			) => withTenantSession(tenantId, () => fn({ tx: sql, db }))
		} as TenantContextService;

		whatsappService = new WhatsappService(new PatientsService(tenantContext), tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`delete from inbound_messages where tenant_id = ${tenantA}`;
		});
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`delete from inbound_messages where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A cannot read Tenant B inbound messages under SET LOCAL', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select id from inbound_messages order by created_at desc`;
		});

		expect(rows.map((r) => r.id)).toEqual([messageA]);
		expect(rows.some((r) => r.id === messageB)).toBe(false);
	});

	it('Tenant B cannot read Tenant A inbound messages under SET LOCAL', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`select id from inbound_messages order by created_at desc`;
		});

		expect(rows.map((r) => r.id)).toEqual([messageB]);
		expect(rows.some((r) => r.id === messageA)).toBe(false);
	});

	it('Tenant A cannot read a specific Tenant B inbound message by id', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select id from inbound_messages where id = ${messageB}`;
		});

		expect(rows).toHaveLength(0);
	});

	it('Tenant A cannot approve Tenant B inbound message', async () => {
		await expect(whatsappService.approveInboxItem(tenantA, messageB)).rejects.toBeInstanceOf(
			NotFoundException
		);

		const status = await withTenantSession(tenantB, async () => {
			const { sql } = getDb(databaseUrl);
			const [row] = await sql`select status from inbound_messages where id = ${messageB}`;
			return row!.status as string;
		});
		expect(status).toBe('new');
	});

	it('Tenant A cannot ignore Tenant B inbound message', async () => {
		await expect(whatsappService.ignoreInboxItem(tenantA, messageB)).rejects.toBeInstanceOf(
			NotFoundException
		);

		const status = await withTenantSession(tenantB, async () => {
			const { sql } = getDb(databaseUrl);
			const [row] = await sql`select status from inbound_messages where id = ${messageB}`;
			return row!.status as string;
		});
		expect(status).toBe('new');
	});

	it('Tenant B can approve its own inbound message', async () => {
		const result = await whatsappService.approveInboxItem(tenantB, messageB);
		expect(result).toEqual({ success: true, id: messageB, status: 'approved' });
	});
});
