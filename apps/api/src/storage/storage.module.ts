import { Global, Module } from '@nestjs/common';
import { FilesSweepService } from './files-sweep.service';
import { LocalFileStorage } from './local-file.storage';
import { RoutingFileStorage, type StorageDriverName } from './routing-file.storage';
import { readS3ConfigFromEnv, S3FileStorage, tryReadS3ConfigFromEnv } from './s3-file.storage';
import { FILE_STORAGE, type FileStoragePort } from './storage.types';

function resolveDefaultDriver(): StorageDriverName {
	const driver = (process.env.STORAGE_DRIVER ?? 'local').trim().toLowerCase() || 'local';
	if (driver === 'local' || driver === 's3') return driver;
	throw new Error(`Unsupported STORAGE_DRIVER="${driver}" (supported: local, s3)`);
}

/**
 * Always keeps LocalFileStorage; attaches S3 when configured.
 * Operations route by key scheme (`local://` vs `s3://`) so mixed rows work
 * during migration. New keys follow STORAGE_DRIVER.
 */
function createFileStorage(): FileStoragePort {
	const defaultDriver = resolveDefaultDriver();
	const local = new LocalFileStorage();
	const s3Config =
		defaultDriver === 's3' ? readS3ConfigFromEnv() : tryReadS3ConfigFromEnv();
	const s3 = s3Config ? new S3FileStorage(s3Config) : null;
	return new RoutingFileStorage(local, s3, defaultDriver);
}

@Global()
@Module({
	providers: [
		{
			provide: FILE_STORAGE,
			useFactory: createFileStorage
		},
		FilesSweepService
	],
	exports: [FILE_STORAGE, FilesSweepService]
})
export class StorageModule {}
