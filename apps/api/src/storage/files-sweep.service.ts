import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { files } from '../db/schema/files';
import { jobs } from '../db/schema/queue';
import { TenantContextService } from '../tenant/tenant-context.service';
import { FILE_STORAGE, PENDING_STORAGE_KEY, type FileStoragePort } from './storage.types';

/** BullMQ + jobs ledger type (Adım 30a). */
export const FILES_SWEEP_PENDING_JOB_TYPE = 'files.sweep_pending';

/** Pending rows older than this are eligible (24h). */
export const FILES_SWEEP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Daily cadence for the repeatable scheduler (ms). */
export const FILES_SWEEP_EVERY_MS = 24 * 60 * 60 * 1000;

/** When `true`, count eligible rows but do not delete DB/storage. */
export const FILES_SWEEP_DRY_RUN_ENV = 'FILES_SWEEP_DRY_RUN';

const LEDGER_QUEUE = 'default';

export type FilesSweepResult = {
	dryRun: boolean;
	candidateCount: number;
	deletedCount: number;
	storageRemovedCount: number;
	candidateIds: string[];
	deletedIds: string[];
};

/**
 * Pure eligibility: only non-deleted `pending`, older than maxAge. Never `ready`.
 * Soft-deleted rows are excluded (GAP-F09-23 — hard-delete yok).
 */
export function isEligiblePendingFile(
	row: { status: string; createdAt: Date; deletedAt?: Date | null },
	now: Date,
	maxAgeMs: number = FILES_SWEEP_MAX_AGE_MS
): boolean {
	if (row.deletedAt != null) return false;
	if (row.status !== 'pending') return false;
	const ageMs = now.getTime() - row.createdAt.getTime();
	return ageMs >= maxAgeMs;
}

@Injectable()
export class FilesSweepService {
	private readonly logger = new Logger(FilesSweepService.name);

	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly config: ConfigService,
		@Inject(FILE_STORAGE) private readonly storage: FileStoragePort
	) {}

	isDryRun(): boolean {
		return this.config.get<string>(FILES_SWEEP_DRY_RUN_ENV)?.trim().toLowerCase() === 'true';
	}

	/**
	 * Sweep one tenant's orphan pending files (presign never confirmed).
	 * Always writes a completed `jobs` ledger row (even when count is 0).
	 */
	async sweepTenant(
		tenantId: string,
		opts?: { now?: Date; dryRun?: boolean; maxAgeMs?: number }
	): Promise<FilesSweepResult> {
		const now = opts?.now ?? new Date();
		const dryRun = opts?.dryRun ?? this.isDryRun();
		const maxAgeMs = opts?.maxAgeMs ?? FILES_SWEEP_MAX_AGE_MS;
		const cutoff = new Date(now.getTime() - maxAgeMs);

		const result = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const candidates = await db
				.select()
				.from(files)
				.where(
					and(
						eq(files.status, 'pending'),
						isNull(files.deletedAt),
						lte(files.createdAt, cutoff)
					)
				);

			const candidateIds = candidates.map((r) => r.id);
			const deletedIds: string[] = [];
			let storageRemovedCount = 0;

			if (!dryRun) {
				for (const row of candidates) {
					// Double-check: never touch ready or soft-deleted (defense in depth).
					if (row.status !== 'pending' || row.deletedAt != null) continue;

					if (row.storageKey && row.storageKey !== PENDING_STORAGE_KEY) {
						try {
							await this.storage.remove(row.storageKey);
							storageRemovedCount++;
						} catch (err) {
							const message = err instanceof Error ? err.message : String(err);
							this.logger.warn(
								`files.sweep_pending: storage remove failed file=${row.id} key=${row.storageKey}: ${message}`
							);
						}
					}

					await db.delete(files).where(eq(files.id, row.id));
					deletedIds.push(row.id);
				}
			}

			const sweepResult: FilesSweepResult = {
				dryRun,
				candidateCount: candidates.length,
				deletedCount: deletedIds.length,
				storageRemovedCount,
				candidateIds,
				deletedIds
			};

			const ledgerNow = new Date();
			await db.insert(jobs).values({
				tenantId,
				queue: LEDGER_QUEUE,
				jobType: FILES_SWEEP_PENDING_JOB_TYPE,
				payload: {
					dry_run: dryRun,
					cutoff: cutoff.toISOString(),
					candidate_count: sweepResult.candidateCount,
					deleted_count: sweepResult.deletedCount,
					storage_removed_count: sweepResult.storageRemovedCount,
					candidate_ids: candidateIds,
					deleted_ids: deletedIds
				},
				status: 'completed',
				attempts: 0,
				startedAt: ledgerNow,
				completedAt: ledgerNow
			});

			return sweepResult;
		});

		this.logger.log(
			`files.sweep_pending tenant=${tenantId} dryRun=${result.dryRun} candidates=${result.candidateCount} deleted=${result.deletedCount}`
		);
		return result;
	}
}
