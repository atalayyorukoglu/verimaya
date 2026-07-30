import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SCORECARD_INCOMPARABILITY_WARNING } from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ScorecardService } from './scorecard.service';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('scorecard compare + baseline block (Adım 37)', () => {
	const tenantId = randomUUID();
	let service: ScorecardService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);
		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Compare', ${`cmp-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Compare', ${`cmp-${tenantId.slice(0, 8)}`})
		`;
		service = new ScorecardService(
			new TenantContextService({ client: db, sql } as unknown as DbService)
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`delete from scorecard_answers where tenant_id = ${tenantId}`;
			await tx`delete from scorecard_assessments where tenant_id = ${tenantId}`;
			await tx`delete from scorecard_profiles where tenant_id = ${tenantId}`;
		});
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		await closeDb();
	});

	it('shows closed zeros between two measurements on the same profile', async () => {
		await service.createProfile(tenantId, {
			band: '5-15',
			setup_s1: true,
			setup_s2: true,
			setup_s3: true
		});
		const first = await service.startAssessment(tenantId);
		await service.upsertAnswer(tenantId, first.assessment.id, {
			criterion_id: '1.1',
			score: 0,
			na_declared: false
		});
		await service.upsertAnswer(tenantId, first.assessment.id, {
			criterion_id: '2.4',
			score: 0,
			na_declared: false
		});
		await service.completeAssessment(tenantId, first.assessment.id);

		const second = await service.startAssessment(tenantId);
		await service.upsertAnswer(tenantId, second.assessment.id, {
			criterion_id: '1.1',
			score: 4,
			na_declared: false
		});
		await service.upsertAnswer(tenantId, second.assessment.id, {
			criterion_id: '2.4',
			score: 0,
			na_declared: false
		});
		await service.completeAssessment(tenantId, second.assessment.id);

		const cmp = await service.compareAssessments(
			tenantId,
			first.assessment.id,
			second.assessment.id
		);
		expect(cmp.comparable).toBe(true);
		if (!cmp.comparable) return;
		expect(cmp.closed_zeros).toBe(1);
		expect(cmp.previous_zero_count).toBe(2);
		expect(cmp.current_zero_count).toBe(1);
		expect(cmp.transitions.some((t) => t.criterion_id === '1.1' && t.closed_zero)).toBe(
			true
		);

		const current = await service.getCurrent(tenantId);
		expect(current.history.length).toBeGreaterThanOrEqual(2);
	});

	it('blocks comparison after profile baseline change with §5 warning', async () => {
		const list = await service.listAssessments(tenantId);
		const previous = list.find((a) => a.completed_at)?.id;
		expect(previous).toBeTruthy();

		const baseline = await service.startBaseline(tenantId, {
			band: '16+',
			setup_s1: true,
			setup_s2: true,
			setup_s3: true
		});
		await service.upsertAnswer(tenantId, baseline.assessment.id, {
			criterion_id: '1.1',
			score: 2,
			na_declared: false
		});
		await service.completeAssessment(tenantId, baseline.assessment.id);

		const cmp = await service.compareAssessments(
			tenantId,
			previous!,
			baseline.assessment.id
		);
		expect(cmp.comparable).toBe(false);
		if (cmp.comparable) return;
		expect(cmp.warning).toBe(SCORECARD_INCOMPARABILITY_WARNING);
	});
});
