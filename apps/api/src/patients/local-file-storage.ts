import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ReadStream } from 'node:fs';

/** Default local upload root (dev stub). Override with UPLOAD_DIR. */
export const DEFAULT_UPLOAD_DIR = '.data/uploads';

/** Max upload size for local disk stub (25 MiB — matches legacy allowlist intent). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const LOCAL_SCHEME = 'local://';

export function getUploadDir(): string {
	const raw = process.env.UPLOAD_DIR?.trim();
	return path.resolve(raw && raw.length > 0 ? raw : DEFAULT_UPLOAD_DIR);
}

/** Relative key under UPLOAD_DIR: `{tenantId}/{patientId}/{fileId}`. */
export function buildLocalStorageKey(
	tenantId: string,
	patientId: string,
	fileId: string
): string {
	return `${LOCAL_SCHEME}${tenantId}/${patientId}/${fileId}`;
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

export async function writeLocalFile(
	storageKey: string,
	data: Buffer
): Promise<string> {
	const absolute = resolveLocalFilePath(storageKey);
	if (!absolute) {
		throw new Error(`Invalid local storage key: ${storageKey}`);
	}
	await mkdir(path.dirname(absolute), { recursive: true });
	await writeFile(absolute, data);
	return absolute;
}

export function openLocalFileStream(storageKey: string): ReadStream | null {
	const absolute = resolveLocalFilePath(storageKey);
	if (!absolute || !existsSync(absolute)) return null;
	return createReadStream(absolute);
}

export function localFileExists(storageKey: string): boolean {
	const absolute = resolveLocalFilePath(storageKey);
	return absolute != null && existsSync(absolute);
}
