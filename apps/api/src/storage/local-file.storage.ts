import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { FileObjectStat, FilePutMeta, FileStoragePort } from './storage.types';

/** Default local upload root (dev stub). Override with UPLOAD_DIR. */
export const DEFAULT_UPLOAD_DIR = '.data/uploads';

const LOCAL_SCHEME = 'local://';

export function getUploadDir(): string {
	const raw = process.env.UPLOAD_DIR?.trim();
	return path.resolve(raw && raw.length > 0 ? raw : DEFAULT_UPLOAD_DIR);
}

export function isPendingStorageKey(storageKey: string): boolean {
	return storageKey === `${LOCAL_SCHEME}pending`;
}

/**
 * Resolve a `local://…` key to an absolute path under UPLOAD_DIR.
 * Returns null for pending keys, non-local keys, or path traversal.
 */
export function resolveLocalFilePath(storageKey: string): string | null {
	if (!storageKey.startsWith(LOCAL_SCHEME)) return null;
	const relative = storageKey.slice(LOCAL_SCHEME.length);
	if (!relative || relative === 'pending') return null;
	if (relative.includes('..') || path.isAbsolute(relative)) return null;

	const parts = relative.split('/').filter(Boolean);
	if (parts.length !== 3) return null;

	const root = getUploadDir();
	const absolute = path.resolve(root, ...parts);
	const relativeToRoot = path.relative(root, absolute);
	if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return null;
	return absolute;
}

/**
 * Local disk adapter — behaviour identical to the former patients/local-file-storage helpers.
 * signedGetUrl / signedPutUrl always return null (no CDN/presign on disk).
 */
export class LocalFileStorage implements FileStoragePort {
	buildKey(tenantId: string, patientId: string, fileId: string): string {
		return `${LOCAL_SCHEME}${tenantId}/${patientId}/${fileId}`;
	}

	async put(key: string, buf: Buffer, _meta?: FilePutMeta): Promise<void> {
		const absolute = resolveLocalFilePath(key);
		if (!absolute) {
			throw new Error(`Invalid local storage key: ${key}`);
		}
		await mkdir(path.dirname(absolute), { recursive: true });
		await writeFile(absolute, buf);
	}

	async getStream(key: string): Promise<Readable | null> {
		const absolute = resolveLocalFilePath(key);
		if (!absolute || !existsSync(absolute)) return null;
		return createReadStream(absolute);
	}

	async exists(key: string): Promise<boolean> {
		const absolute = resolveLocalFilePath(key);
		return absolute != null && existsSync(absolute);
	}

	async stat(key: string): Promise<FileObjectStat | null> {
		const absolute = resolveLocalFilePath(key);
		if (!absolute || !existsSync(absolute)) return null;
		const st = statSync(absolute);
		return { sizeBytes: st.size, contentType: null };
	}

	async remove(key: string): Promise<void> {
		const absolute = resolveLocalFilePath(key);
		if (!absolute || !existsSync(absolute)) return;
		await unlink(absolute);
	}

	async signedGetUrl(_key: string, _ttlSeconds: number): Promise<string | null> {
		return null;
	}

	async signedPutUrl(_key: string, _ttlSeconds: number): Promise<string | null> {
		return null;
	}
}
