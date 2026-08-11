import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
	FILES_SWEEP_MAX_AGE_MS,
	FILES_SWEEP_PENDING_JOB_TYPE,
	FilesSweepService,
	isEligiblePendingFile
} from './files-sweep.service';
import { LocalFileStorage, getUploadDir } from './local-file.storage';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('isEligiblePendingFile (Adım 30a)', () => {
	const now = new Date('2026-07-30T12:00:00.000Z');

	it('accepts pending older than 24h', () => {
		const createdAt = new Date(now.getTime() - 25 * 60 * 60 * 1000);
		expect(isEligiblePendingFile({ status: 'pending', createdAt }, now)).toBe(true);
	});

	it('rejects pending younger than 24h', () => {
		const createdAt = new Date(now.getTime() - 23 * 60 * 60 * 1000);
		expect(isEligiblePendingFile({ status: 'pending', createdAt }, now)).toBe(false);
	});

	it('never accepts ready regardless of age', () => {
		const createdAt = new Date(now.getTime() - 72 * 60 * 60 * 1000);
		expect(isEligiblePendingFile({ status: 'ready', createdAt }, now)).toBe(false);
	});

	it('rejects soft-deleted pending even when old (GAP-F09-23)', () => {
		const createdAt = new Date(now.getTime() - 25 * 60 * 60 * 1000);
		expect(
			isEligiblePendingFile(
				{ status: 'pending', createdAt, deletedAt: new Date(now.getTime() - 1000) },
				now
			)
		).toBe(false);
	});
});

describe('FilesSweepService (Adım 30a)', () => {
	const tenantId = randomUUID();
	let patientId: string;
	let pendingOldId: string;
	let pendingYoungId: string;
	let readyOldId: string;
	let pendingOldKey: string;
	let sql: ReturnType<typeof getDb>['sql'];
	let sweep: FilesSweepService;
	const storage = new LocalFileStorage();

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		({ sql } = getDb(databaseUrl));
		const { db } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Sweep Tenant', ${`sweep-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Sweep Tenant', ${`sweep-${tenantId.slice(0, 8)}`})
		`;

		patientId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantId}, 'Hasta', 0)
				on conflict (tenant_id, name) do update set name = excluded.name`;
			const [row] = await tx`insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (
					${tenantId},
					(select id from contact_types where tenant_id = ${tenantId} and name = 'Hasta' limit 1),
					'Hasta', 'Sweep Patient', 'Sweep Patient'
				)
				returning id`;
			return row!.id as string;
		});

		pendingOldId = randomUUID();
		pendingYoungId = randomUUID();
		readyOldId = randomUUID();
		pendingOldKey = storage.buildKey(tenantId, patientId, pendingOldId);

		const abs = path.join(getUploadDir(), tenantId, patientId);
		await mkdir(abs, { recursive: true });
		await writeFile(path.join(abs, pendingOldId), Buffer.from('orphan-bytes'));

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`
				insert into files (
					id, tenant_id, contact_id, filename, mime_type, size_bytes, storage_key, status, created_at
				) values
					(
						${pendingOldId}, ${tenantId}, ${patientId}, 'old-pending.bin',
						'application/octet-stream', 12, ${pendingOldKey}, 'pending',
						now() - interval '25 hours'
					),
					(
						${pendingYoungId}, ${tenantId}, ${patientId}, 'young-pending.bin',
						'application/octet-stream', 0, 'local://pending', 'pending',
						now() - interval '23 hours'
					),
					(
						${readyOldId}, ${tenantId}, ${patientId}, 'old-ready.bin',
						'application/octet-stream', 0, 'local://pending', 'ready',
						now() - interval '72 hours'
					)
			`;
		});

		const dbService = { client: db, sql } as unknown as DbService;
		const tenantContext = new TenantContextService(dbService);
		const config = {
			get: () => undefined
		} as unknown as ConfigService;

		sweep = new FilesSweepService(tenantContext, config, storage);
	});

	afterAll(async () => {
		await purgeTenantFixtures(sql, [tenantId]);
		await closeDb();
	});

	it('dry-run counts eligible rows without deleting', async () => {
		const result = await sweep.sweepTenant(tenantId, {
			now: new Date(),
			dryRun: true,
			maxAgeMs: FILES_SWEEP_MAX_AGE_MS
		});
		expect(result.dryRun).toBe(true);
		expect(result.candidateCount).toBe(1);
		expect(result.candidateIds).toEqual([pendingOldId]);
		expect(result.deletedCount).toBe(0);

		const stillThere = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`select id, status from files where tenant_id = ${tenantId} order by filename`;
		});
		expect(stillThere.map((r) => r.id).sort()).toEqual(
			[pendingOldId, pendingYoungId, readyOldId].sort()
		);
		expect(await storage.exists(pendingOldKey)).toBe(true);
	});

	it('deletes 25h pending, keeps 23h pending and any ready; writes ledger', async () => {
		const result = await sweep.sweepTenant(tenantId, {
			now: new Date(),
			dryRun: false,
			maxAgeMs: FILES_SWEEP_MAX_AGE_MS
		});
		expect(result.deletedCount).toBe(1);
		expect(result.deletedIds).toEqual([pendingOldId]);
		expect(await storage.exists(pendingOldKey)).toBe(false);

		const remaining = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`select id, status from files where tenant_id = ${tenantId}`;
		});
		expect(remaining.map((r) => r.id).sort()).toEqual([pendingYoungId, readyOldId].sort());
		expect(remaining.find((r) => r.id === readyOldId)?.status).toBe('ready');

		const ledger = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`
				select job_type, payload
				from jobs
				where tenant_id = ${tenantId} and job_type = ${FILES_SWEEP_PENDING_JOB_TYPE}
				order by created_at desc
				limit 1
			`;
		});
		expect(ledger).toHaveLength(1);
		const payload = ledger[0]!.payload as { deleted_count: number; dry_run: boolean };
		expect(payload.deleted_count).toBe(1);
		expect(payload.dry_run).toBe(false);
	});
});
