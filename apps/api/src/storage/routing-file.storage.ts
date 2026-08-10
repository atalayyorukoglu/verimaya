import type { Readable } from 'node:stream';
import type { LocalFileStorage } from './local-file.storage';
import type { S3FileStorage } from './s3-file.storage';
import type { FileObjectStat, FilePutMeta, FileStoragePort } from './storage.types';

export type StorageDriverName = 'local' | 's3';

/**
 * Routes each call by `storage_key` scheme so mixed local:// + s3:// rows work
 * during / after migration. `buildKey` follows STORAGE_DRIVER (new uploads).
 */
export class RoutingFileStorage implements FileStoragePort {
	constructor(
		private readonly local: LocalFileStorage,
		private readonly s3: S3FileStorage | null,
		private readonly defaultDriver: StorageDriverName
	) {
		if (defaultDriver === 's3' && !s3) {
			throw new Error('STORAGE_DRIVER=s3 requires a configured S3 adapter');
		}
	}

	buildKey(tenantId: string, contactId: string, fileId: string): string {
		if (this.defaultDriver === 's3') {
			return this.requireS3().buildKey(tenantId, contactId, fileId);
		}
		return this.local.buildKey(tenantId, contactId, fileId);
	}

	async put(key: string, buf: Buffer, meta?: FilePutMeta): Promise<void> {
		return this.adapterFor(key).put(key, buf, meta);
	}

	async getStream(key: string): Promise<Readable | null> {
		return this.adapterFor(key).getStream(key);
	}

	async exists(key: string): Promise<boolean> {
		return this.adapterFor(key).exists(key);
	}

	async stat(key: string): Promise<FileObjectStat | null> {
		return this.adapterFor(key).stat(key);
	}

	async remove(key: string): Promise<void> {
		return this.adapterFor(key).remove(key);
	}

	async signedGetUrl(key: string, ttlSeconds: number): Promise<string | null> {
		return this.adapterFor(key).signedGetUrl(key, ttlSeconds);
	}

	async signedPutUrl(key: string, ttlSeconds: number): Promise<string | null> {
		return this.adapterFor(key).signedPutUrl(key, ttlSeconds);
	}

	private adapterFor(key: string): FileStoragePort {
		if (key.startsWith('s3://')) {
			return this.requireS3();
		}
		if (key.startsWith('local://')) {
			return this.local;
		}
		throw new Error(`Unknown storage key scheme: ${key}`);
	}

	private requireS3(): S3FileStorage {
		if (!this.s3) {
			throw new Error(
				'S3 storage key present but S3 is not configured (set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)'
			);
		}
		return this.s3;
	}
}
