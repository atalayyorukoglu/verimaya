import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import type { Job } from 'bullmq';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { jobs } from '../db/schema';
import { TenantContextService } from '../tenant/tenant-context.service';
import { GHL_RECONCILE_JOB_TYPE } from './queue.constants';
import { DEFAULT_QUEUE_NAME, type DefaultQueueJobData, QueueService } from './queue.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('QueueService.markScheduledJobDead (AUDIT-F09-05)', () => {
	const tenantId = randomUUID();
	let queueService: QueueService;
	let tenantContext: TenantContextService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql: pg } = getDb(databaseUrl);

		await pg`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Sched DLQ', ${`sdlq-${tenantId.slice(0, 8)}`}, now())
		`;
		await pg`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Sched DLQ', ${`sdlq-${tenantId.slice(0, 8)}`})
		`;

		const dbService = { client: db, sql: pg } as unknown as DbService;
		tenantContext = new TenantContextService(dbService);
		queueService = Object.create(QueueService.prototype) as QueueService;
		(queueService as unknown as { tenantContext: TenantContextService }).tenantContext =
			tenantContext;
		(queueService as unknown as { logger: { error: () => void } }).logger = { error: () => undefined };
	});

	afterAll(async () => {
		const { sql: pg } = getDb(databaseUrl);
		await purgeTenantFixtures(pg, [tenantId]);
		await closeDb();
	});

	function fakeJob(bullmqId: string): Job<DefaultQueueJobData> {
		return {
			id: bullmqId,
			attemptsMade: 5,
			processedOn: Date.now(),
			data: {
				jobId: `${GHL_RECONCILE_JOB_TYPE}:${tenantId}`,
				tenantId,
				jobType: GHL_RECONCILE_JOB_TYPE
			}
		} as Job<DefaultQueueJobData>;
	}

	it('writes a dead jobs ledger row on scheduler exhaustion', async () => {
		const bullmqId = `bull-${randomUUID()}`;
		await queueService.markScheduledJobDead(fakeJob(bullmqId), new Error('boom'));

		const rows = await tenantContext.withTenant(tenantId, async ({ db }) =>
			db
				.select()
				.from(jobs)
				.where(and(eq(jobs.tenantId, tenantId), eq(jobs.bullmqJobId, bullmqId)))
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.status).toBe('dead');
		expect(rows[0]?.jobType).toBe(GHL_RECONCILE_JOB_TYPE);
		expect(rows[0]?.attempts).toBe(5);
		expect(rows[0]?.lastError).toBe('boom');
		expect(rows[0]?.queue).toBe(DEFAULT_QUEUE_NAME);
	});

	it('does not create a duplicate row when called twice for the same bullmq job', async () => {
		const bullmqId = `bull-${randomUUID()}`;
		const job = fakeJob(bullmqId);
		await queueService.markScheduledJobDead(job, new Error('first'));
		await queueService.markScheduledJobDead(job, new Error('second'));

		const count = await tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db
				.select({ n: sql<number>`count(*)::int` })
				.from(jobs)
				.where(and(eq(jobs.tenantId, tenantId), eq(jobs.bullmqJobId, bullmqId)));
			return row?.n ?? 0;
		});

		expect(count).toBe(1);

		const [row] = await tenantContext.withTenant(tenantId, async ({ db }) =>
			db.select().from(jobs).where(eq(jobs.bullmqJobId, bullmqId)).limit(1)
		);
		expect(row?.lastError).toBe('second');
		expect(row?.status).toBe('dead');
	});
});
