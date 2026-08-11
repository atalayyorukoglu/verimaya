import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	SCORECARD_INCOMPARABILITY_WARNING,
	SCORECARD_PROFILE_LOCKED_CODE
} from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ScorecardService } from './scorecard.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('scorecard profile lock + RLS (Adım 34)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let service: ScorecardService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`sc-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`sc-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`sc-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`sc-b-${tenantB.slice(0, 8)}`})
		`;

		const dbService = { client: db, sql } as unknown as DbService;
		service = new ScorecardService(new TenantContextService(dbService));
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('locks profile on first assessment; band change returns 409', async () => {
		const created = await service.createProfile(tenantA, {
			band: '5-15',
			setup_s1: true,
			setup_s2: false,
			setup_s3: true
		});
		expect(created.locked_at).toBeNull();

		await service.patchActiveProfile(tenantA, { band: '1-4' });
		const patched = await service.getActiveProfile(tenantA);
		expect(patched?.band).toBe('1-4');

		const started = await service.startAssessment(tenantA);
		expect(started.profile.locked_at).toBeTruthy();
		expect(started.assessment.is_baseline).toBe(false);

		try {
			await service.patchActiveProfile(tenantA, { band: '16+' });
			expect.unreachable('expected ConflictException');
		} catch (err) {
			expect(err).toBeInstanceOf(ConflictException);
			const body = (err as ConflictException).getResponse() as {
				error: { code: string; message: string };
			};
			expect(body.error.code).toBe(SCORECARD_PROFILE_LOCKED_CODE);
			expect(body.error.message).toMatch(/baseline/i);
			expect(body.error.message).toMatch(/POST \/v1\/scorecard\/baseline/);
		}
	});

	it('baseline archives old profile and starts incomparable assessment', async () => {
		const before = await service.getActiveProfile(tenantA);
		expect(before?.locked_at).toBeTruthy();
		const oldId = before!.id;

		const baseline = await service.startBaseline(tenantA, {
			band: '16+',
			setup_s1: true,
			setup_s2: true,
			setup_s3: true
		});

		expect(baseline.archived_profile_id).toBe(oldId);
		expect(baseline.profile.band).toBe('16+');
		expect(baseline.profile.locked_at).toBeTruthy();
		expect(baseline.assessment.is_baseline).toBe(true);
		expect(baseline.assessment.incomparability_warning).toBe(
			SCORECARD_INCOMPARABILITY_WARNING
		);

		const active = await service.getActiveProfile(tenantA);
		expect(active?.id).toBe(baseline.profile.id);
		expect(active?.id).not.toBe(oldId);
	});

	it('Tenant B cannot see Tenant A profiles (RLS)', async () => {
		await service.createProfile(tenantB, {
			band: '1-4',
			setup_s1: false,
			setup_s2: false,
			setup_s3: false
		});

		const a = await service.getActiveProfile(tenantA);
		const b = await service.getActiveProfile(tenantB);
		expect(a?.band).toBe('16+');
		expect(b?.band).toBe('1-4');
		expect(a?.id).not.toBe(b?.id);

		const { sql } = getDb(databaseUrl);
		const underB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`select id, band from scorecard_profiles where archived_at is null`;
		});
		expect(underB).toHaveLength(1);
		expect(underB[0]?.id).toBe(b?.id);
		expect(underB.some((r) => r.id === a?.id)).toBe(false);
	});
});
