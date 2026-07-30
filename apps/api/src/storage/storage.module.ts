import { Global, Module } from '@nestjs/common';
import { LocalFileStorage } from './local-file.storage';
import { readS3ConfigFromEnv, S3FileStorage } from './s3-file.storage';
import { FILE_STORAGE, type FileStoragePort } from './storage.types';

function createFileStorage(): FileStoragePort {
	const driver = (process.env.STORAGE_DRIVER ?? 'local').trim().toLowerCase() || 'local';
	if (driver === 'local') {
		return new LocalFileStorage();
	}
	if (driver === 's3') {
		return new S3FileStorage(readS3ConfigFromEnv());
	}
	throw new Error(`Unsupported STORAGE_DRIVER="${driver}" (supported: local, s3)`);
}

@Global()
@Module({
	providers: [
		{
			provide: FILE_STORAGE,
			useFactory: createFileStorage
		}
	],
	exports: [FILE_STORAGE]
})
export class StorageModule {}
