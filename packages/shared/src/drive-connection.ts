import { z } from 'zod';
import { isoDateTime } from './common.js';

/**
 * DRIVE-01 — firmanın Google Drive bağlantısının durumu.
 *
 * Drive AYNADIR: ana kayıt Verimaya'nın kendi deposudur, Drive tek yönlü kopyadır.
 * Bu yüzden burada "senkron" değil "aynalama" sayaçları var.
 */
export const driveConnectionStatus = z.object({
	connected: z.boolean(),
	/** Bağlı Google hesabının e-postası; Drive `about.get` vermezse null. */
	account_email: z.string().nullable(),
	/** "Verimaya Hastalar" kök klasörünün kimliği (uygulama açar). */
	root_folder_id: z.string().nullable(),
	/** Kök klasörün tarayıcıda açılacak adresi. */
	root_folder_url: z.string().nullable(),
	key_version: z.number().int().nullable(),
	/** Kişi klasörü sayısı. */
	folder_count: z.number().int().nonnegative(),
	/** Drive'a kopyalanmış (ek, kişi) çifti sayısı. */
	mirrored_file_count: z.number().int().nonnegative(),
	/** Kişiye bağlı olup henüz kopyalanmamış çift sayısı. */
	pending_count: z.number().int().nonnegative(),
	/** Son toplu gönderimin bitiş zamanı. */
	last_run_at: isoDateTime.nullable(),
	last_run_sent: z.number().int().nonnegative(),
	last_run_skipped: z.number().int().nonnegative(),
	last_run_failed: z.number().int().nonnegative()
});
export type DriveConnectionStatus = z.infer<typeof driveConnectionStatus>;

/** "Şimdiye kadarkileri gönder" — toplu gönderim kuyruğa alındı. */
export const driveSyncResponse = z.object({
	queued: z.boolean(),
	job_id: z.string().nullable()
});
export type DriveSyncResponse = z.infer<typeof driveSyncResponse>;

export const driveOAuthCallbackQuery = z.object({
	code: z.string().min(1),
	state: z.string().min(1)
});
export type DriveOAuthCallbackQuery = z.infer<typeof driveOAuthCallbackQuery>;
