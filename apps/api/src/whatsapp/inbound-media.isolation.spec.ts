import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotFoundException, UnsupportedMediaTypeException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { LocalFileStorage } from '../storage/local-file.storage';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { InboundMediaService } from './inbound-media.service';
import { MediaClassifyService } from './media-classify.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';
import { driveMirrorEnqueueStub } from '../test/drive-mirror-stub';

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

/** WAHA-01: ek yalnız kendi kiracısının mesajına yazılır ve oradan okunur. */
describe('inbound_message_media', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const msgA = randomUUID();
	const extA = `wa-media-${tenantA.slice(0, 8)}`;
	let service: InboundMediaService;
	let tenantContext: TenantContextService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'wa-media-'));
		const { db, sql } = getDb(databaseUrl);
		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`wm-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`wm-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`wm-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`wm-b-${tenantB.slice(0, 8)}`})
		`;
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`
				insert into inbound_messages (id, tenant_id, provider, external_id, payload, status)
				values (${msgA}, ${tenantA}, 'waha', ${extA},
					${JSON.stringify({ payload: { id: extA, from: '1@g.us', body: null, hasMedia: true } })}::jsonb, 'new')
			`;
		});
		tenantContext = {
			withTenant: async <T>(
				tenantId: string,
				fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>
			) => withTenantSession(tenantId, () => fn({ tx: sql, db }))
		} as TenantContextService;
		service = new InboundMediaService(
			tenantContext,
			driveMirrorEnqueueStub(),
			new MediaClassifyService(tenantContext),
			new LocalFileStorage()
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('eki yazar, ikinci gelişte mükerrer der, geri akıtır', async () => {
		const buf = Buffer.from('ÿØÿà sahte jpeg', 'latin1');
		const first = await service.store(tenantA, {
			externalId: extA,
			mimetype: 'image/jpeg',
			filename: 'bilet.jpg',
			buf
		});
		expect(first).toMatchObject({ duplicate: false, inboundMessageId: msgA });

		const again = await service.store(tenantA, {
			externalId: extA,
			mimetype: 'image/jpeg',
			filename: 'bilet.jpg',
			buf
		});
		expect(again).toEqual({ ...first, duplicate: true });

		const meta = await tenantContext.withTenant(tenantA, ({ db }) =>
			service.forMessagesWithDb(db, [msgA])
		);
		expect(meta.get(msgA)).toMatchObject({ mime_type: 'image/jpeg', size_bytes: buf.length });

		const opened = await service.open(tenantA, msgA);
		const chunks: Buffer[] = [];
		for await (const c of opened.stream) chunks.push(Buffer.from(c));
		expect(Buffer.concat(chunks).equals(buf)).toBe(true);
	});

	it('yürütülebilir tür reddedilir', async () => {
		await expect(
			service.store(tenantA, {
				externalId: extA,
				mimetype: 'application/x-msdownload',
				filename: 'x.exe',
				buf: Buffer.from('MZ')
			})
		).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
	});

	it("B, A'nın mesajına ek yazamaz ve okuyamaz", async () => {
		await expect(
			service.store(tenantB, {
				externalId: extA,
				mimetype: 'image/png',
				filename: null,
				buf: Buffer.from('png')
			})
		).rejects.toBeInstanceOf(NotFoundException);
		await expect(service.open(tenantB, msgA)).rejects.toBeInstanceOf(NotFoundException);
	});
});
