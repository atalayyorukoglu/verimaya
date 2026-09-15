import type { DriveMirrorEnqueueService } from '../integrations/google-drive/drive-mirror-enqueue.service';

/**
 * DRIVE-01 — testlerde Drive kuyruğu sessizdir: gerçek ağ yok, BullMQ yok.
 * Aynalama ana işi düşürmemeli; bu sahte de hiçbir şey yapmadan döner.
 */
export function driveMirrorEnqueueStub(): DriveMirrorEnqueueService {
	return {
		enqueueSync: async () => undefined,
		enqueueBackfill: async () => null,
		enqueueBackfillForTenant: async () => null,
		enqueuePurgeContact: async () => undefined,
		enqueueMoveContact: async () => undefined
	} as unknown as DriveMirrorEnqueueService;
}
