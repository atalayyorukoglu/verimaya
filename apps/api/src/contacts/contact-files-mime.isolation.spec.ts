import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
	NotFoundException,
	UnsupportedMediaTypeException
} from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { LocalFileStorage } from '../storage/local-file.storage';
import { RoutingFileStorage } from '../storage/routing-file.storage';
import type { S3FileStorage } from '../storage/s3-file.storage';
import type { FileStoragePort } from '../storage/storage.types';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { assertUploadMimeMatchesBytes } from './file-mime';
import { ContactsService } from './contacts.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * AUDIT-F09-08 + GAP-F09-24: magic-byte MIME sniff + safe inline preview.
 * Tenant mock mirrors production: drizzle `db.transaction` + SET LOCAL (is_local=true).
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const MINIMAL_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

const MINIMAL_PDF = Buffer.from(
	'%PDF-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'
);

const MINIMAL_JPEG = Buffer.from(
	'/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
	'base64'
);

/** RIFF WEBP — file-type@16 recognizes this 1×1 lossy webp. */
const MINIMAL_WEBP = Buffer.from(
	'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
	'base64'
);

function errorCode(err: unknown): string | undefined {
	if (!(err instanceof UnsupportedMediaTypeException)) return undefined;
	const body = err.getResponse() as { error?: { code?: string } };
	return body.error?.code;
}

describe('AUDIT-F09-08 file-mime helper', () => {
	it('accepts pdf/png/jpeg/webp and normalizes image/jpg', async () => {
		await expect(assertUploadMimeMatchesBytes(MINIMAL_PDF, 'application/pdf')).resolves.toBe(
			'application/pdf'
		);
		await expect(assertUploadMimeMatchesBytes(MINIMAL_PNG, 'image/png')).resolves.toBe(
			'image/png'
		);
		await expect(assertUploadMimeMatchesBytes(MINIMAL_JPEG, 'image/jpeg')).resolves.toBe(
			'image/jpeg'
		);
		await expect(assertUploadMimeMatchesBytes(MINIMAL_JPEG, 'image/jpg')).resolves.toBe(
			'image/jpeg'
		);
		await expect(assertUploadMimeMatchesBytes(MINIMAL_WEBP, 'image/webp')).resolves.toBe(
			'image/webp'
		);
	});

	it('rejects allowlist-off declared MIME', async () => {
		await expect(assertUploadMimeMatchesBytes(MINIMAL_PNG, 'application/x-msdownload')).rejects.toSatisfy(
			(err: unknown) => errorCode(err) === 'unsupported_media_type'
		);
	});

	it('rejects sniff mismatch (PNG bytes as application/pdf)', async () => {
		await expect(assertUploadMimeMatchesBytes(MINIMAL_PNG, 'application/pdf')).rejects.toSatisfy(
			(err: unknown) => errorCode(err) === 'mime_mismatch'
		);
	});

	it('rejects undetectable content (sniff undefined)', async () => {
		await expect(
			assertUploadMimeMatchesBytes(Buffer.from('hello world not a file'), 'application/pdf')
		).rejects.toSatisfy((err: unknown) => errorCode(err) === 'unsupported_media_type');
	});
});

describe('AUDIT-F09-08 + GAP-F09-24 patient file MIME + preview', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const uploaderUserId = randomUUID();
	let patientA: string;
	let patientB: string;
	let service: ContactsService;
	let localPutSpy: ReturnType<typeof vi.fn>;
	let s3PutSpy: ReturnType<typeof vi.fn>;
	let storage: FileStoragePort;

	const uploader = { userId: uploaderUserId, displayName: 'Uploader A' };

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into "user" (id, name, email)
			values (${uploaderUserId}, 'Mime Uploader', ${`mime-up-${uploaderUserId.slice(0, 8)}@test.local`})
		`;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				db.transaction(async (tx) => {
					await tx.execute(
						drizzleSql`select set_config('app.current_tenant_id', ${id}, true)`
					);
					return fn({ db: tx as TenantDb });
				})
		} as TenantContextService;

		const local = new LocalFileStorage();
		localPutSpy = vi.spyOn(local, 'put');
		s3PutSpy = vi.fn(async () => undefined);
		const s3 = {
			buildKey: (t: string, p: string, f: string) => `s3://${t}/${p}/${f}`,
			put: s3PutSpy,
			getStream: vi.fn(async () => null),
			exists: vi.fn(async () => false),
			stat: vi.fn(async () => null),
			remove: vi.fn(async () => undefined),
			signedGetUrl: vi.fn(async () => null),
			signedPutUrl: vi.fn(async () => null)
		} as unknown as S3FileStorage;

		storage = new RoutingFileStorage(local, s3, 'local');
		service = new ContactsService(tenantContext, storage);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Mime A', ${`mime-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Mime B', ${`mime-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Mime A', ${`mime-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Mime B', ${`mime-b-${tenantB.slice(0, 8)}`})
		`;

		patientA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantA}, 'Hasta', 0)
				on conflict (tenant_id, name) do update set name = excluded.name`;
			const [row] = await tx`insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (
					${tenantA},
					(select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1),
					'Hasta', 'Patient Mime A', 'Patient Mime A'
				)
				returning id`;
			return row!.id as string;
		});
		patientB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantB}, 'Hasta', 0)
				on conflict (tenant_id, name) do update set name = excluded.name`;
			const [row] = await tx`insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (
					${tenantB},
					(select id from contact_types where tenant_id = ${tenantB} and name = 'Hasta' limit 1),
					'Hasta', 'Patient Mime B', 'Patient Mime B'
				)
				returning id`;
			return row!.id as string;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await sql`delete from "user" where id = ${uploaderUserId}`;
		await closeDb();
	});

	it('multipart uploadLocalFileWithDb accepts allowlisted types', async () => {
		const cases: Array<{ data: Buffer; mime: string; name: string }> = [
			{ data: MINIMAL_PDF, mime: 'application/pdf', name: 'a.pdf' },
			{ data: MINIMAL_PNG, mime: 'image/png', name: 'a.png' },
			{ data: MINIMAL_JPEG, mime: 'image/jpeg', name: 'a.jpg' },
			{ data: MINIMAL_WEBP, mime: 'image/webp', name: 'a.webp' }
		];
		for (const c of cases) {
			const created = await service['tenantContext'].withTenant(tenantA, async ({ db }) =>
				service.uploadLocalFileWithDb(
					db,
					tenantA,
					patientA,
					{ filename: c.name, mimeType: c.mime, data: c.data },
					uploader
				)
			);
			expect(created.mime_type).toBe(c.mime === 'image/jpg' ? 'image/jpeg' : c.mime);
			expect(created.status).toBe('ready');
		}
	});

	it('multipart upload rejects mismatch / allowlist-off / undetectable without storage.put', async () => {
		localPutSpy.mockClear();
		s3PutSpy.mockClear();

		await expect(
			service['tenantContext'].withTenant(tenantA, async ({ db }) =>
				service.uploadLocalFileWithDb(
					db,
					tenantA,
					patientA,
					{ filename: 'evil.pdf', mimeType: 'application/pdf', data: MINIMAL_PNG },
					uploader
				)
			)
		).rejects.toSatisfy((err: unknown) => errorCode(err) === 'mime_mismatch');

		await expect(
			service['tenantContext'].withTenant(tenantA, async ({ db }) =>
				service.uploadLocalFileWithDb(
					db,
					tenantA,
					patientA,
					{
						filename: 'x.exe',
						mimeType: 'application/x-msdownload',
						data: Buffer.from('MZ')
					},
					uploader
				)
			)
		).rejects.toSatisfy((err: unknown) => errorCode(err) === 'unsupported_media_type');

		await expect(
			service['tenantContext'].withTenant(tenantA, async ({ db }) =>
				service.uploadLocalFileWithDb(
					db,
					tenantA,
					patientA,
					{
						filename: 'x.pdf',
						mimeType: 'application/pdf',
						data: Buffer.from('not a real pdf')
					},
					uploader
				)
			)
		).rejects.toSatisfy((err: unknown) => errorCode(err) === 'unsupported_media_type');

		expect(localPutSpy).not.toHaveBeenCalled();
		expect(s3PutSpy).not.toHaveBeenCalled();
	});

	it('presign + putFileContent sniff rejects and accepts via same choke point', async () => {
		const badPresign = await service['tenantContext'].withTenant(tenantA, async ({ db }) =>
			service.presignFileWithDb(
				db,
				tenantA,
				patientA,
				{
					filename: 'spoof.pdf',
					mime_type: 'application/pdf',
					size_bytes: MINIMAL_PNG.byteLength
				},
				uploader
			)
		);

		localPutSpy.mockClear();
		s3PutSpy.mockClear();
		await expect(
			service.putFileContent(tenantA, patientA, badPresign.file_id, MINIMAL_PNG, 'application/pdf')
		).rejects.toSatisfy((err: unknown) => errorCode(err) === 'mime_mismatch');
		expect(localPutSpy).not.toHaveBeenCalled();
		expect(s3PutSpy).not.toHaveBeenCalled();

		const okPresign = await service['tenantContext'].withTenant(tenantA, async ({ db }) =>
			service.presignFileWithDb(
				db,
				tenantA,
				patientA,
				{
					filename: 'ok.png',
					mime_type: 'image/png',
					size_bytes: MINIMAL_PNG.byteLength
				},
				uploader
			)
		);
		await expect(
			service.putFileContent(tenantA, patientA, okPresign.file_id, MINIMAL_PNG, 'image/png')
		).resolves.toEqual({ accepted: true });
		expect(localPutSpy).toHaveBeenCalled();
	});

	it('S3 default driver also refuses bad bytes before put (RoutingFileStorage choke)', async () => {
		const { db } = getDb(databaseUrl);
		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				db.transaction(async (tx) => {
					await tx.execute(
						drizzleSql`select set_config('app.current_tenant_id', ${id}, true)`
					);
					return fn({ db: tx as TenantDb });
				})
		} as TenantContextService;

		const local = new LocalFileStorage();
		const s3Put = vi.fn(async () => undefined);
		const s3 = {
			buildKey: (t: string, p: string, f: string) => `s3://${t}/${p}/${f}`,
			put: s3Put,
			getStream: vi.fn(async () => null),
			exists: vi.fn(async () => false),
			stat: vi.fn(async () => null),
			remove: vi.fn(async () => undefined),
			signedGetUrl: vi.fn(async () => null),
			signedPutUrl: vi.fn(async () => null)
		} as unknown as S3FileStorage;
		const routing = new RoutingFileStorage(local, s3, 's3');
		const s3Service = new ContactsService(tenantContext, routing);

		await expect(
			s3Service['tenantContext'].withTenant(tenantA, async ({ db: tx }) =>
				s3Service.uploadLocalFileWithDb(
					tx,
					tenantA,
					patientA,
					{ filename: 'bad.pdf', mimeType: 'application/pdf', data: MINIMAL_PNG },
					uploader
				)
			)
		).rejects.toSatisfy((err: unknown) => errorCode(err) === 'mime_mismatch');
		expect(s3Put).not.toHaveBeenCalled();
	});

	it('preview: allowlisted MIME → inline; legacy MIME → attachment; 404 + isolation', async () => {
		const pngFile = await service['tenantContext'].withTenant(tenantA, async ({ db }) =>
			service.uploadLocalFileWithDb(
				db,
				tenantA,
				patientA,
				{ filename: 'preview.png', mimeType: 'image/png', data: MINIMAL_PNG },
				uploader
			)
		);

		const inlinePreview = await service.openFilePreview(tenantA, patientA, pngFile.id);
		expect(inlinePreview.disposition).toBe('inline');
		expect(inlinePreview.mimeType).toBe('image/png');
		expect(inlinePreview.stream).toBeInstanceOf(Readable);
		inlinePreview.stream.destroy();

		const { sql } = getDb(databaseUrl);
		const legacyId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const storageKey = `local://${tenantA}/${patientA}/${randomUUID()}`;
			await new LocalFileStorage().put(storageKey, Buffer.from('legacy-bytes'), {
				contentType: 'application/octet-stream',
				filename: 'legacy.bin'
			});
			const [row] = await tx`
				insert into files (
					tenant_id, contact_id, filename, mime_type, size_bytes, storage_key, status
				)
				values (
					${tenantA}, ${patientA}, 'legacy.bin', 'application/octet-stream',
					${Buffer.from('legacy-bytes').byteLength}, ${storageKey}, 'ready'
				)
				returning id
			`;
			return row!.id as string;
		});

		const attachmentPreview = await service.openFilePreview(tenantA, patientA, legacyId);
		expect(attachmentPreview.disposition).toBe('attachment');
		attachmentPreview.stream.destroy();

		await expect(service.openFilePreview(tenantA, patientA, randomUUID())).rejects.toBeInstanceOf(
			NotFoundException
		);

		const bFile = await service['tenantContext'].withTenant(tenantB, async ({ db }) =>
			service.uploadLocalFileWithDb(
				db,
				tenantB,
				patientB,
				{ filename: 'b.png', mimeType: 'image/png', data: MINIMAL_PNG },
				uploader
			)
		);

		await expect(service.openFilePreview(tenantA, patientB, bFile.id)).rejects.toBeInstanceOf(
			NotFoundException
		);
		await expect(service.openFileDownload(tenantA, patientB, bFile.id)).rejects.toBeInstanceOf(
			NotFoundException
		);
		await expect(service.openFilePreview(tenantA, patientA, bFile.id)).rejects.toBeInstanceOf(
			NotFoundException
		);
	});
});
