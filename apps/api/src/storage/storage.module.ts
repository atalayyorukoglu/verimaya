import { Global, Module } from '@nestjs/common';
import { LocalFileStorage } from './local-file.storage';
import { FILE_STORAGE, type FileStoragePort } from './storage.types';

function createFileStorage(): FileStoragePort {
	const driver = (process.env.STORAGE_DRIVER ?? 'local').trim().toLowerCase() || 'local';
	if (driver === 'local') {
		return new LocalFileStorage();
	}
	throw new Error(
		`Unsupported STORAGE_DRIVER="${driver}" (Adım 17: only "local"; S3/R2 lands in Adım 18)`
	);
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
