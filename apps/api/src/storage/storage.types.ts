import type { Readable } from 'node:stream';

/** Max upload size (25 MiB) — enforced at the API boundary. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Default presigned / upload URL TTL (5 minutes). */
export const DEFAULT_PRESIGN_TTL_SECONDS = 5 * 60;

/** Metadata-only file rows (no bytes on disk yet). */
export const PENDING_STORAGE_KEY = 'local://pending';

export type FilePutMeta = {
	contentType?: string;
	filename?: string;
};

export type FileObjectStat = {
	sizeBytes: number;
	contentType: string | null;
};

/**
 * Domain-facing file storage port — patients never talk to S3/disk directly.
 * Local: signed* → null. S3/R2: short-lived presigned URLs (default 5 min).
 */
export interface FileStoragePort {
	/** Opaque `storage_key` for a new object (`local://…` or later `s3://…`). */
	buildKey(tenantId: string, contactId: string, fileId: string): string;

	put(key: string, buf: Buffer, meta?: FilePutMeta): Promise<void>;

	getStream(key: string): Promise<Readable | null>;

	exists(key: string): Promise<boolean>;

	/** Object metadata (HeadObject / fs.stat); null if missing. */
	stat(key: string): Promise<FileObjectStat | null>;

	remove(key: string): Promise<void>;

	/** Presigned GET; local driver returns null. */
	signedGetUrl(key: string, ttlSeconds: number): Promise<string | null>;

	/** Presigned PUT; local driver returns null. */
	signedPutUrl(key: string, ttlSeconds: number): Promise<string | null>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');
