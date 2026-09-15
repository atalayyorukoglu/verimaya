/** DRIVE-01 — tek mesajın eklerini bağlı kişilerin Drive klasörüne kopyalar. */
export const DRIVE_MIRROR_SYNC_JOB_TYPE = 'drive_mirror.sync';

/** DRIVE-01 — geriye dönük: kişiye bağlı tüm ekleri tarar, eksikleri gönderir. */
export const DRIVE_MIRROR_BACKFILL_JOB_TYPE = 'drive_mirror.backfill';

/** DRIVE-01 — KVKK silme: kişinin Drive dosyaları ve klasörü kalıcı silinir. */
export const DRIVE_MIRROR_PURGE_CONTACT_JOB_TYPE = 'drive_mirror.purge_contact';

/** DRIVE-01 — kişi birleştirme: dosyalar hayatta kalanın klasörüne taşınır. */
export const DRIVE_MIRROR_MOVE_CONTACT_JOB_TYPE = 'drive_mirror.move_contact';

/** Worker yönlendirmesi: `drive_mirror.*` tek işlemciye gider. */
export const DRIVE_MIRROR_JOB_PREFIX = 'drive_mirror.';
