import { describe, expect, it } from 'vitest';
import { QueueService } from './queue.service';
import { AD_METRICS_SYNC_JOB_TYPE, GHL_RECONCILE_JOB_TYPE } from './queue.constants';
// Bu sabit kuyruk sabitlerinde değil, süpürme servisinde tanımlı.
import { FILES_SWEEP_PENDING_JOB_TYPE } from '../storage/files-sweep.service';

/**
 * Silinen kiracıların zamanlayıcıları Redis'te kalıyordu: `upsertJobScheduler`
 * yalnız ekliyor/güncelliyor, kaldırmıyordu. Her tetiklemede iş koşup `jobs`
 * ledger'ına yazmaya çalışıyor ve `tenant_id` FK'sına takılıyordu — prod'da
 * 2026-09-10'da beş silinmiş kiracı için 195+ hata birikmişti.
 */
function servisKur(schedulerKeys: string[]) {
	const kaldirilan: string[] = [];
	const queue = {
		getJobSchedulers: async () => schedulerKeys.map((key) => ({ key })),
		removeJobScheduler: async (key: string) => {
			kaldirilan.push(key);
			return true;
		}
	};
	const service = Object.create(QueueService.prototype) as QueueService;
	(service as unknown as { defaultQueue: unknown }).defaultQueue = queue;
	(service as unknown as { logger: Record<string, () => void> }).logger = {
		log: () => undefined,
		warn: () => undefined,
		error: () => undefined
	};
	const temizle = (known: Set<string>) =>
		(
			service as unknown as {
				removeSchedulersForMissingTenants: (k: Set<string>) => Promise<number>;
			}
		).removeSchedulersForMissingTenants(known);
	return { temizle, kaldirilan };
}

const YASAYAN = '11111111-1111-4111-8111-111111111111';
const SILINEN = '22222222-2222-4222-8222-222222222222';

describe('QueueService: silinen kiracıların zamanlayıcıları', () => {
	it('kiracısı olmayan zamanlayıcıyı kaldırır', async () => {
		const { temizle, kaldirilan } = servisKur([
			`${GHL_RECONCILE_JOB_TYPE}:${SILINEN}`,
			`${AD_METRICS_SYNC_JOB_TYPE}:${SILINEN}`,
			`${FILES_SWEEP_PENDING_JOB_TYPE}:${SILINEN}`
		]);
		await expect(temizle(new Set([YASAYAN]))).resolves.toBe(3);
		expect(kaldirilan).toHaveLength(3);
	});

	it('yaşayan kiracının zamanlayıcısına dokunmaz', async () => {
		const { temizle, kaldirilan } = servisKur([
			`${GHL_RECONCILE_JOB_TYPE}:${YASAYAN}`,
			`${GHL_RECONCILE_JOB_TYPE}:${SILINEN}`
		]);
		await expect(temizle(new Set([YASAYAN]))).resolves.toBe(1);
		expect(kaldirilan).toEqual([`${GHL_RECONCILE_JOB_TYPE}:${SILINEN}`]);
	});

	it('tanımadığı anahtarları bırakır', async () => {
		const { temizle, kaldirilan } = servisKur([
			'outbox.deliver:some-id',
			'baska-sistem:xyz',
			`${GHL_RECONCILE_JOB_TYPE}:${SILINEN}`
		]);
		await expect(temizle(new Set([YASAYAN]))).resolves.toBe(1);
		expect(kaldirilan).toEqual([`${GHL_RECONCILE_JOB_TYPE}:${SILINEN}`]);
	});

	/** İş tipi nokta içeriyor (`ghl.reconcile`); ayırıcı ilk nokta değil, iki nokta. */
	it('nokta içeren iş tipini doğru ayırır', async () => {
		const { temizle, kaldirilan } = servisKur([`${AD_METRICS_SYNC_JOB_TYPE}:${SILINEN}`]);
		await expect(temizle(new Set([YASAYAN]))).resolves.toBe(1);
		expect(kaldirilan[0]).toBe(`${AD_METRICS_SYNC_JOB_TYPE}:${SILINEN}`);
	});

	it('liste okunamazsa açılışı düşürmez', async () => {
		const service = Object.create(QueueService.prototype) as QueueService;
		(service as unknown as { defaultQueue: unknown }).defaultQueue = {
			getJobSchedulers: async () => {
				throw new Error('redis yok');
			}
		};
		(service as unknown as { logger: Record<string, () => void> }).logger = {
			warn: () => undefined
		};
		await expect(
			(
				service as unknown as {
					removeSchedulersForMissingTenants: (k: Set<string>) => Promise<number>;
				}
			).removeSchedulersForMissingTenants(new Set([YASAYAN]))
		).resolves.toBe(0);
	});
});
