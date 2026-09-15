import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { jobs } from '../../db/schema/queue';
import {
	DRIVE_MIRROR_BACKFILL_JOB_TYPE,
	DRIVE_MIRROR_MOVE_CONTACT_JOB_TYPE,
	DRIVE_MIRROR_PURGE_CONTACT_JOB_TYPE,
	DRIVE_MIRROR_SYNC_JOB_TYPE
} from '../../queue/drive-mirror.constants';
import { QueueService } from '../../queue/queue.service';
import { TenantContextService, type TenantDb } from '../../tenant/tenant-context.service';

/**
 * DRIVE-01 — `drive_mirror.*` işlerini kuyruğa atar.
 *
 * `QueueService` kurucuda DEĞİL, `ModuleRef` ile çağrı anında çözülür. Sebep:
 * QueueService worker'ı kurarken `InboundMessageProcessor` → `WhatsappService` →
 * `MessageContactsService` zincirini enjekte ediyor; bu servis de o zincirin
 * içinden çağrıldığı için kurucuda QueueService istemek dairesel bağımlılık
 * yaratır ve Nest açılışta patlar. Geç çözüm bu halkayı kırar.
 *
 * Kayıt kaynağı Postgres'tir (AGENTS ilke 4): `jobs` satırı her hâlükârda
 * yazılır; BullMQ'ya eklemek başarısız olursa iş kaybolmaz, yalnız beklemede
 * kalır ve bir sonraki toplu gönderim onu yakalar. Aynalama asla ana işi
 * düşürmez — çağıranlar hatayı yutar.
 */
@Injectable()
export class DriveMirrorEnqueueService {
	private readonly logger = new Logger(DriveMirrorEnqueueService.name);

	constructor(
		private readonly moduleRef: ModuleRef,
		private readonly tenantContext: TenantContextService
	) {}

	/** Bir mesajın ekleri bağlı kişilerin klasörüne kopyalansın. */
	async enqueueSync(db: TenantDb, tenantId: string, inboundMessageId: string): Promise<void> {
		await this.enqueue(db, tenantId, DRIVE_MIRROR_SYNC_JOB_TYPE, { inboundMessageId });
	}

	/** Geriye dönük tarama (tek iş; kendi içinde tüm ekleri dolaşır). */
	async enqueueBackfill(db: TenantDb, tenantId: string): Promise<string | null> {
		return this.enqueue(db, tenantId, DRIVE_MIRROR_BACKFILL_JOB_TYPE, {});
	}

	/** Kiracı bağlamı dışından (controller) çağrı için kendi oturumunu açar. */
	async enqueueBackfillForTenant(tenantId: string): Promise<string | null> {
		return this.tenantContext.withTenant(tenantId, ({ db }) => this.enqueueBackfill(db, tenantId));
	}

	async enqueuePurgeContact(db: TenantDb, tenantId: string, contactId: string): Promise<void> {
		await this.enqueue(db, tenantId, DRIVE_MIRROR_PURGE_CONTACT_JOB_TYPE, { contactId });
	}

	async enqueueMoveContact(
		db: TenantDb,
		tenantId: string,
		fromContactId: string,
		toContactId: string
	): Promise<void> {
		await this.enqueue(db, tenantId, DRIVE_MIRROR_MOVE_CONTACT_JOB_TYPE, {
			fromContactId,
			toContactId
		});
	}

	private async enqueue(
		db: TenantDb,
		tenantId: string,
		jobType: string,
		payload: Record<string, unknown>
	): Promise<string | null> {
		const jobId = randomUUID();
		try {
			await db.insert(jobs).values({
				id: jobId,
				tenantId,
				queue: 'default',
				jobType,
				payload,
				status: 'pending'
			});
		} catch (err) {
			this.logger.warn(`drive mirror job row failed (${jobType}): ${message(err)}`);
			return null;
		}

		const queue = this.queueService();
		if (!queue) return jobId;
		try {
			const bullJob = await queue.enqueueDefaultJob(jobType, { jobId, tenantId, jobType });
			await db
				.update(jobs)
				.set({ bullmqJobId: bullJob.id ?? null, updatedAt: new Date() })
				.where(eq(jobs.id, jobId));
		} catch (err) {
			this.logger.warn(`drive mirror enqueue failed (${jobType}): ${message(err)}`);
		}
		return jobId;
	}

	private queueService(): QueueService | null {
		try {
			return this.moduleRef.get(QueueService, { strict: false });
		} catch {
			return null;
		}
	}
}

function message(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
